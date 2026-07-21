"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageFinance, getUserContext } from "@/lib/rbac"
import { parseMoneyToCents, type ParsedBudgetRow } from "@/lib/finance"

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
