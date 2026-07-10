"use server"

import { revalidatePath } from "next/cache"
import type { AssignmentStatus } from "@prisma/client"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageRoster, getUserContext } from "@/lib/rbac"

async function requireRosterManager(slug: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Not signed in")

  const org = await db.organization.findUnique({ where: { slug } })
  if (!org) throw new Error("Organization not found")

  const ctx = await getUserContext(session.user.id)
  const allowed = canManageRoster(ctx, org)

  await db.auditEvent.create({
    data: {
      institutionId: org.institutionId,
      organizationId: org.id,
      actorId: session.user.id,
      action: "Roster.Manage",
      resourceType: "RoleAssignment",
      outcome: allowed ? "ALLOW" : "DENY",
    },
  })

  if (!allowed) throw new Error("You do not have permission to manage this roster")
  return { org, userId: session.user.id }
}

/** Assign a user (by email) to a role seat. Creates the user if unknown. */
export async function assignMember(slug: string, formData: FormData) {
  const { org } = await requireRosterManager(slug)

  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const roleId = String(formData.get("roleId") ?? "")
  const status = String(formData.get("status") ?? "ACTIVE") as AssignmentStatus

  if (!email || !roleId) throw new Error("Email and role are required")
  if (!["SHADOW", "ACTIVE"].includes(status)) throw new Error("Invalid status")

  const role = await db.role.findFirst({
    where: { id: roleId, organizationId: org.id },
  })
  if (!role) throw new Error("Role not found in this organization")

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: email.split("@")[0] },
  })

  const existing = await db.roleAssignment.findFirst({
    where: { userId: user.id, roleId, status: { in: ["SHADOW", "ACTIVE"] } },
  })
  if (existing) throw new Error("This person already holds that role")

  await db.roleAssignment.create({ data: { userId: user.id, roleId, status } })
  revalidatePath(`/orgs/${slug}/members`)
}

/**
 * Transition an assignment along the handoff lifecycle:
 * SHADOW → ACTIVE (term begins) or ACTIVE → ALUMNI (term ends, access revoked).
 */
export async function transitionAssignment(slug: string, formData: FormData) {
  const { org } = await requireRosterManager(slug)

  const assignmentId = String(formData.get("assignmentId") ?? "")
  const to = String(formData.get("to") ?? "") as AssignmentStatus

  const assignment = await db.roleAssignment.findFirst({
    where: { id: assignmentId, role: { organizationId: org.id } },
  })
  if (!assignment) throw new Error("Assignment not found")

  const legal =
    (assignment.status === "SHADOW" && to === "ACTIVE") ||
    (assignment.status === "ACTIVE" && to === "ALUMNI")
  if (!legal) throw new Error(`Cannot move ${assignment.status} to ${to}`)

  await db.roleAssignment.update({
    where: { id: assignment.id },
    data: { status: to, ...(to === "ALUMNI" ? { endDate: new Date() } : {}) },
  })
  revalidatePath(`/orgs/${slug}/members`)
}
