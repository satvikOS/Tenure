"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { OrgCategory } from "@prisma/client"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext, isOseDirector } from "@/lib/rbac"

function slugify(name: string) {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

function code(name: string) {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean)
  return words.length === 1
    ? words[0].slice(0, 3).toUpperCase()
    : words.map((w) => w[0].toUpperCase()).join("").slice(0, 5)
}

const CATEGORIES: OrgCategory[] = ["COMMUNITY", "PROFESSIONAL", "ORGANIZATION", "SOCIAL"]

/** OSE Director: charter a new club with standard board seats. */
export async function createClub(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not signed in")

  const ctx = await getUserContext(session.user.id)
  const institutionId = ctx.institutionRoles.find((m) => m.role === "OSE_DIRECTOR")?.institutionId
  if (!institutionId || !isOseDirector(ctx, institutionId))
    throw new Error("Only the OSE Director can charter clubs")

  const name = String(formData.get("name") ?? "").trim()
  const category = String(formData.get("category") ?? "") as OrgCategory
  const description = String(formData.get("description") ?? "").trim()
  if (!name) throw new Error("Club name is required")
  if (!CATEGORIES.includes(category)) throw new Error("Pick a category")

  const slug = slugify(name)
  const existing = await db.organization.findUnique({ where: { slug } })
  if (existing) throw new Error("A club with that name already exists")

  const club = await db.$transaction(async (tx) => {
    const c = await tx.organization.create({
      data: { institutionId, name, slug, category, description: description || null },
    })
    // Standard starting seats — permanent position IDs from day one
    const seats: { n: string; s: "PRESIDENT" | "FUNCTIONAL" | "MEMBER" }[] = [
      { n: "President", s: "PRESIDENT" },
      { n: "VP Finance & Operations", s: "FUNCTIONAL" },
      { n: "VP Marketing & Communications", s: "FUNCTIONAL" },
      { n: "VP Events & Partnerships", s: "FUNCTIONAL" },
      { n: "Member", s: "MEMBER" },
    ]
    for (const seat of seats) {
      await tx.role.create({
        data: {
          organizationId: c.id,
          name: seat.n,
          scope: seat.s,
          positionCode: `${code(name)}-${seat.n === "President" ? "PRES" : seat.n === "Member" ? "MEMB" : seat.n.split(/\s+/).slice(0, 3).map((w) => (w.toUpperCase() === "VP" ? "VP" : w.slice(0, 4).toUpperCase())).join("-").replace(/[^A-Z-]/g, "")}`,
        },
      })
    }
    await tx.auditEvent.create({
      data: {
        institutionId,
        organizationId: c.id,
        actorId: session.user!.id!,
        action: "Club.Chartered",
        resourceType: "Organization",
        resourceId: c.id,
        outcome: "ALLOW",
      },
    })
    return c
  })

  revalidatePath("/orgs")
  redirect(`/orgs/${club.slug}/members`)
}

/** OSE Director: archive or reactivate a club. */
export async function setClubStatus(formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not signed in")

  const organizationId = String(formData.get("organizationId") ?? "")
  const status = String(formData.get("status") ?? "") as "ACTIVE" | "ARCHIVED"

  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) throw new Error("Club not found")

  const ctx = await getUserContext(session.user.id)
  if (!isOseDirector(ctx, org.institutionId))
    throw new Error("Only the OSE Director can change club status")
  if (!["ACTIVE", "ARCHIVED"].includes(status)) throw new Error("Invalid status")

  await db.$transaction([
    db.organization.update({ where: { id: org.id }, data: { status } }),
    db.auditEvent.create({
      data: {
        institutionId: org.institutionId,
        organizationId: org.id,
        actorId: session.user.id,
        action: status === "ARCHIVED" ? "Club.Archived" : "Club.Reactivated",
        resourceType: "Organization",
        resourceId: org.id,
        outcome: "ALLOW",
      },
    }),
  ])

  revalidatePath("/orgs")
}
