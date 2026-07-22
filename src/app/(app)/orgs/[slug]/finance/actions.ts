"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageFinance, getUserContext } from "@/lib/rbac"
import {
  parseMoneyToCents,
  ledgerSignedCents,
  LEDGER_KINDS,
  type LedgerKindName,
  type ParsedBudgetRow,
} from "@/lib/finance"

const CURRENT_YEAR = "2026-2027"

async function requireFinanceManager(slug: string, action: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not signed in")

  const org = await db.organization.findUnique({ where: { slug } })
  if (!org) throw new Error("Organization not found")

  const ctx = await getUserContext(session.user.id)
  const allowed = canManageFinance(ctx, org)

  await db.auditEvent.create({
    data: {
      institutionId: org.institutionId,
      organizationId: org.id,
      actorId: session.user.id,
      action,
      resourceType: "BudgetLine",
      outcome: allowed ? "ALLOW" : "DENY",
    },
  })

  if (!allowed) throw new Error("You do not have permission to manage this club's finances")
  return { org, userId: session.user.id }
}

/** Create or update a single budget line (category, budgeted, actual). */
export async function upsertBudgetLine(slug: string, formData: FormData) {
  const { org } = await requireFinanceManager(slug, "Finance.EditLine")

  const category = String(formData.get("category") ?? "").trim()
  if (!category) throw new Error("Category is required")

  const budgetedCents = parseMoneyToCents(formData.get("budgeted")) ?? 0
  const actualCents = parseMoneyToCents(formData.get("actual")) ?? 0
  const note = String(formData.get("note") ?? "").trim() || null

  const existingCount = await db.budgetLine.count({
    where: { organizationId: org.id, academicYear: CURRENT_YEAR },
  })

  await db.budgetLine.upsert({
    where: {
      organizationId_academicYear_category: {
        organizationId: org.id,
        academicYear: CURRENT_YEAR,
        category,
      },
    },
    update: { budgetedCents, actualCents, note },
    create: {
      organizationId: org.id,
      academicYear: CURRENT_YEAR,
      category,
      budgetedCents,
      actualCents,
      note,
      sortOrder: existingCount,
      source: "manual",
    },
  })

  revalidatePath(`/orgs/${slug}/finance`)
}

export async function deleteBudgetLine(slug: string, formData: FormData) {
  const { org } = await requireFinanceManager(slug, "Finance.DeleteLine")
  const id = String(formData.get("id") ?? "")
  // Scope the delete to this org so an id from another club can't be removed.
  await db.budgetLine.deleteMany({ where: { id, organizationId: org.id } })
  revalidatePath(`/orgs/${slug}/finance`)
}

/**
 * Save a forecast projection across lines. Values arrive as
 * forecast-<lineId> = dollar string; an empty value clears the forecast.
 */
export async function saveForecast(slug: string, formData: FormData) {
  const { org } = await requireFinanceManager(slug, "Finance.SaveForecast")

  const lines = await db.budgetLine.findMany({
    where: { organizationId: org.id, academicYear: CURRENT_YEAR },
    select: { id: true },
  })

  await db.$transaction(
    lines.map((line) => {
      const raw = formData.get(`forecast-${line.id}`)
      const cents = raw == null || String(raw).trim() === "" ? null : parseMoneyToCents(raw)
      return db.budgetLine.update({
        where: { id: line.id },
        data: { forecastCents: cents },
      })
    })
  )

  revalidatePath(`/orgs/${slug}/finance`)
}

/**
 * Replace the club's budget with rows parsed from an uploaded spreadsheet.
 * The client parses the file (the xlsx dependency already ships) and posts
 * clean rows here; the server re-validates money and owns the write.
 */
export async function importBudget(
  slug: string,
  rows: ParsedBudgetRow[],
  mode: "replace" | "merge"
) {
  const { org } = await requireFinanceManager(slug, "Finance.Import")

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No rows to import")
  }
  if (rows.length > 500) {
    throw new Error("That file has too many rows to import at once (max 500)")
  }

  await db.$transaction(async (tx) => {
    if (mode === "replace") {
      // Only clear imported lines; never destroy manually-entered ones.
      await tx.budgetLine.deleteMany({
        where: { organizationId: org.id, academicYear: CURRENT_YEAR, source: "import" },
      })
    }

    let sortOrder = await tx.budgetLine.count({
      where: { organizationId: org.id, academicYear: CURRENT_YEAR },
    })

    for (const row of rows) {
      const category = String(row.category ?? "").trim()
      if (!category) continue
      // Re-validate on the server: never trust client-computed cents.
      const budgetedCents = Math.round(Number(row.budgetedCents) || 0)
      const actualCents = Math.round(Number(row.actualCents) || 0)

      await tx.budgetLine.upsert({
        where: {
          organizationId_academicYear_category: {
            organizationId: org.id,
            academicYear: CURRENT_YEAR,
            category,
          },
        },
        update: { budgetedCents, actualCents, source: "import" },
        create: {
          organizationId: org.id,
          academicYear: CURRENT_YEAR,
          category,
          budgetedCents,
          actualCents,
          source: "import",
          sortOrder: sortOrder++,
        },
      })
    }
  })

  revalidatePath(`/orgs/${slug}/finance`)
}

/** Confirm an id belongs to this org before it's attached as a ledger source. */
async function orgScopedId(
  finder: (id: string) => Promise<{ id: string } | null>,
  raw: FormDataEntryValue | null
): Promise<string | null> {
  const id = String(raw ?? "").trim()
  if (!id) return null
  return (await finder(id))?.id ?? null
}

/**
 * Post a ledger entry against a budget line, then recompute that line's actual
 * from the ledger — so "spent" is always the sum of posted transactions, never
 * a hand-typed number that can drift. Source links (approval / vendor / receipt)
 * are validated to belong to this org so a foreign id can't be attached.
 */
export async function postLedgerEntry(slug: string, formData: FormData) {
  const { org, userId } = await requireFinanceManager(slug, "Finance.PostLedger")

  const budgetLineId = String(formData.get("budgetLineId") ?? "")
  const line = await db.budgetLine.findFirst({
    where: { id: budgetLineId, organizationId: org.id, academicYear: CURRENT_YEAR },
    select: { id: true },
  })
  if (!line) throw new Error("Budget line not found")

  const kindRaw = String(formData.get("kind") ?? "SPEND")
  const kind: LedgerKindName = (LEDGER_KINDS as string[]).includes(kindRaw)
    ? (kindRaw as LedgerKindName)
    : "SPEND"

  const magnitude = parseMoneyToCents(formData.get("amount"))
  if (magnitude == null || magnitude === 0) throw new Error("Enter an amount")
  const amountCents = ledgerSignedCents(kind, magnitude)

  const description = String(formData.get("description") ?? "").trim()
  if (!description) throw new Error("Enter a description")
  const memo = String(formData.get("memo") ?? "").trim() || null

  const occurredRaw = String(formData.get("occurredAt") ?? "").trim()
  const occurredAt =
    /^\d{4}-\d{2}-\d{2}$/.test(occurredRaw) && !isNaN(new Date(occurredRaw).getTime())
      ? new Date(`${occurredRaw}T12:00:00.000Z`)
      : new Date()

  const approvalId = await orgScopedId(
    (id) => db.approvalRequest.findFirst({ where: { id, organizationId: org.id }, select: { id: true } }),
    formData.get("approvalId")
  )
  const vendorId = await orgScopedId(
    (id) => db.vendor.findFirst({ where: { id, organizationId: org.id }, select: { id: true } }),
    formData.get("vendorId")
  )
  const documentId = await orgScopedId(
    (id) => db.document.findFirst({ where: { id, organizationId: org.id }, select: { id: true } }),
    formData.get("documentId")
  )

  await db.$transaction(async (tx) => {
    await tx.ledgerEntry.create({
      data: {
        organizationId: org.id,
        budgetLineId: line.id,
        academicYear: CURRENT_YEAR,
        kind,
        amountCents,
        description,
        memo,
        occurredAt,
        approvalId,
        vendorId,
        documentId,
        postedById: userId,
      },
    })
    const agg = await tx.ledgerEntry.aggregate({
      where: { budgetLineId: line.id },
      _sum: { amountCents: true },
    })
    await tx.budgetLine.update({
      where: { id: line.id },
      data: { actualCents: agg._sum.amountCents ?? 0 },
    })
  })

  revalidatePath(`/orgs/${slug}/finance`)
}

/** Remove a ledger entry (correction) and recompute the line's actual. */
export async function deleteLedgerEntry(slug: string, formData: FormData) {
  const { org } = await requireFinanceManager(slug, "Finance.DeleteLedger")
  const id = String(formData.get("id") ?? "")
  const entry = await db.ledgerEntry.findFirst({
    where: { id, organizationId: org.id },
    select: { id: true, budgetLineId: true },
  })
  if (!entry) return

  await db.$transaction(async (tx) => {
    await tx.ledgerEntry.delete({ where: { id: entry.id } })
    const agg = await tx.ledgerEntry.aggregate({
      where: { budgetLineId: entry.budgetLineId },
      _sum: { amountCents: true },
    })
    await tx.budgetLine.update({
      where: { id: entry.budgetLineId },
      data: { actualCents: agg._sum.amountCents ?? 0 },
    })
  })

  revalidatePath(`/orgs/${slug}/finance`)
}
