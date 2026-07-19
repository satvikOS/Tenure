"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { AssignmentStatus, InstitutionRole, OrgCategory, RoleScope } from "@prisma/client"
import { db } from "@/lib/db"
import { requireCapability } from "@/lib/admin/guard"
import { ORG_CATEGORIES, chartClub, clubCode } from "@/lib/clubs"
import { directory } from "@/lib/directory"
import { notifyUsers } from "@/lib/notify"

const INSTITUTION_ROLES: InstitutionRole[] = ["OSE_DIRECTOR", "OSE_STAFF", "OSE_ADVISOR"]

function revalidateAdmin(slug?: string) {
  revalidatePath("/admin")
  revalidatePath("/admin/clubs")
  revalidatePath("/admin/people")
  if (slug) {
    revalidatePath(`/admin/clubs/${slug}`)
    revalidatePath(`/orgs/${slug}/members`)
  }
  revalidatePath("/orgs")
}

async function orgOrThrow(organizationId: string) {
  const org = await db.organization.findUnique({ where: { id: organizationId } })
  if (!org) throw new Error("Club not found")
  return org
}

/** Resolve (and upsert) a login user for a directory person, so a seat holder
 *  can eventually authenticate. Name comes from the directory when known. */
async function upsertHolder(email: string, name?: string) {
  const clean = email.trim().toLowerCase()
  if (!clean) throw new Error("A person is required")
  const entry = name ? null : await directory().getByEmail(clean)
  return db.user.upsert({
    where: { email: clean },
    update: {},
    create: { email: clean, name: name?.trim() || entry?.name || clean.split("@")[0] },
  })
}

// ─── Clubs ──────────────────────────────────────────────────────────────────

export async function adminCharterClub(formData: FormData) {
  const { userId, institutionId } = await requireCapability("club.create")
  const name = String(formData.get("name") ?? "")
  const category = String(formData.get("category") ?? "") as OrgCategory
  const description = String(formData.get("description") ?? "")
  const club = await chartClub(institutionId, { name, category, description }, userId)
  revalidateAdmin(club.slug)
  redirect(`/admin/clubs/${club.slug}`)
}

export async function adminEditClub(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "")
  const org = await orgOrThrow(organizationId)
  await requireCapability("club.edit", {
    institutionId: org.institutionId,
    organizationId: org.id,
    resourceType: "Organization",
    resourceId: org.id,
  })

  const name = String(formData.get("name") ?? "").trim()
  const shortName = String(formData.get("shortName") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const category = String(formData.get("category") ?? "") as OrgCategory
  if (!name) throw new Error("Club name is required")
  if (!ORG_CATEGORIES.includes(category)) throw new Error("Pick a category")

  await db.organization.update({
    where: { id: org.id },
    data: {
      name,
      shortName: shortName || null,
      description: description || null,
      category,
    },
  })
  revalidateAdmin(org.slug)
}

export async function adminSetOrgStatus(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "")
  const status = String(formData.get("status") ?? "") as "ACTIVE" | "ARCHIVED"
  const org = await orgOrThrow(organizationId)
  await requireCapability("club.archive", {
    institutionId: org.institutionId,
    organizationId: org.id,
    resourceType: "Organization",
    resourceId: org.id,
  })
  if (!["ACTIVE", "ARCHIVED"].includes(status)) throw new Error("Invalid status")
  await db.organization.update({ where: { id: org.id }, data: { status } })
  revalidateAdmin(org.slug)
}

// ─── Roles: assign / remove / transfer ────────────────────────────────────────

export async function adminAssignSeat(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "")
  const roleId = String(formData.get("roleId") ?? "")
  const email = String(formData.get("personEmail") ?? "")
  const name = String(formData.get("personName") ?? "")
  const status = (String(formData.get("status") ?? "ACTIVE") as AssignmentStatus) || "ACTIVE"
  const org = await orgOrThrow(organizationId)
  await requireCapability("role.assign", {
    institutionId: org.institutionId,
    organizationId: org.id,
    resourceType: "RoleAssignment",
  })

  const role = await db.role.findFirst({ where: { id: roleId, organizationId: org.id } })
  if (!role) throw new Error("Seat not found in this club")
  if (!["ACTIVE", "SHADOW"].includes(status)) throw new Error("Invalid status")

  const user = await upsertHolder(email, name)
  const existing = await db.roleAssignment.findFirst({
    where: { userId: user.id, roleId, status: { in: ["SHADOW", "ACTIVE"] } },
  })
  if (existing) throw new Error("This person already holds that seat")

  await db.roleAssignment.create({ data: { userId: user.id, roleId, status } })
  await notifyUsers([user.id], {
    title: `You've been assigned to ${org.name} as ${role.name}`,
    body: status === "SHADOW" ? "Shadow access is read-only until your term begins." : undefined,
    href: `/orgs/${org.slug}/members`,
  })
  revalidateAdmin(org.slug)
}

export async function adminRemoveAssignment(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "")
  const mode = String(formData.get("mode") ?? "revoke") // "revoke" | "delete"
  const assignment = await db.roleAssignment.findUnique({
    where: { id: assignmentId },
    include: { role: { include: { organization: true } } },
  })
  if (!assignment) throw new Error("Assignment not found")
  const org = assignment.role.organization
  await requireCapability("role.remove", {
    institutionId: org.institutionId,
    organizationId: org.id,
    resourceType: "RoleAssignment",
    resourceId: assignmentId,
  })

  if (mode === "delete") {
    await db.roleAssignment.delete({ where: { id: assignmentId } })
  } else {
    await db.roleAssignment.update({
      where: { id: assignmentId },
      data: { status: "ALUMNI", endDate: new Date() },
    })
    await notifyUsers([assignment.userId], {
      title: `Your ${assignment.role.name} role at ${org.name} has ended`,
      body: "Access is revoked; your seat's knowledge stays for your successor.",
    })
  }
  revalidateAdmin(org.slug)
}

export async function adminTransferSeat(formData: FormData) {
  const roleId = String(formData.get("roleId") ?? "")
  const email = String(formData.get("personEmail") ?? "")
  const name = String(formData.get("personName") ?? "")
  const role = await db.role.findUnique({
    where: { id: roleId },
    include: { organization: true, assignments: { where: { status: "ACTIVE" } } },
  })
  if (!role) throw new Error("Seat not found")
  const org = role.organization
  await requireCapability("role.transfer", {
    institutionId: org.institutionId,
    organizationId: org.id,
    resourceType: "RoleAssignment",
    resourceId: roleId,
  })

  const user = await upsertHolder(email, name)
  if (role.assignments.some((a) => a.userId === user.id))
    throw new Error("That person already holds this seat")

  await db.$transaction(async (tx) => {
    // End the current holder(s), then place the new person.
    for (const a of role.assignments) {
      await tx.roleAssignment.update({
        where: { id: a.id },
        data: { status: "ALUMNI", endDate: new Date() },
      })
    }
    await tx.roleAssignment.create({ data: { userId: user.id, roleId, status: "ACTIVE" } })
  })

  const previousHolders = role.assignments.map((a) => a.userId)
  await notifyUsers([user.id], {
    title: `You now hold ${role.name} at ${org.name}`,
    body: "The seat was transferred to you — its full history is available.",
    href: `/orgs/${org.slug}/members`,
  })
  if (previousHolders.length)
    await notifyUsers(previousHolders, {
      title: `Your ${role.name} role at ${org.name} was transferred`,
      body: "Thank you for your service — the seat's knowledge stays for your successor.",
    })
  revalidateAdmin(org.slug)
}

// ─── Seats (Role CRUD) ────────────────────────────────────────────────────────

export async function adminCreateSeat(formData: FormData) {
  const organizationId = String(formData.get("organizationId") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const scope = (String(formData.get("scope") ?? "FUNCTIONAL") as RoleScope) || "FUNCTIONAL"
  const org = await orgOrThrow(organizationId)
  await requireCapability("seat.manage", {
    institutionId: org.institutionId,
    organizationId: org.id,
    resourceType: "Role",
  })
  if (!name) throw new Error("Seat name is required")
  const dupe = await db.role.findFirst({ where: { organizationId: org.id, name } })
  if (dupe) throw new Error("That seat already exists")

  const suffix = name.replace(/[^A-Za-z0-9]+/g, "").slice(0, 6).toUpperCase()
  await db.role.create({
    data: { organizationId: org.id, name, scope, positionCode: `${clubCode(org.name)}-${suffix}` },
  })
  revalidateAdmin(org.slug)
}

export async function adminRenameSeat(formData: FormData) {
  const roleId = String(formData.get("roleId") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const role = await db.role.findUnique({ where: { id: roleId }, include: { organization: true } })
  if (!role) throw new Error("Seat not found")
  await requireCapability("seat.manage", {
    institutionId: role.organization.institutionId,
    organizationId: role.organizationId,
    resourceType: "Role",
    resourceId: roleId,
  })
  if (!name) throw new Error("Seat name is required")
  await db.role.update({ where: { id: roleId }, data: { name } })
  revalidateAdmin(role.organization.slug)
}

export async function adminDeleteSeat(formData: FormData) {
  const roleId = String(formData.get("roleId") ?? "")
  const role = await db.role.findUnique({
    where: { id: roleId },
    include: {
      organization: true,
      _count: { select: { assignments: true, holdings: true, memoryRecords: true } },
    },
  })
  if (!role) throw new Error("Seat not found")
  await requireCapability("seat.manage", {
    institutionId: role.organization.institutionId,
    organizationId: role.organizationId,
    resourceType: "Role",
    resourceId: roleId,
  })
  const { assignments, holdings, memoryRecords } = role._count
  if (assignments + holdings + memoryRecords > 0)
    throw new Error("This seat carries history and cannot be deleted — retire it instead")
  await db.role.delete({ where: { id: roleId } })
  revalidateAdmin(role.organization.slug)
}

// ─── Directory ────────────────────────────────────────────────────────────────

export async function adminAddDirectoryPerson(formData: FormData) {
  await requireCapability("directory.manage", { resourceType: "DirectoryPerson" })
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const kind = (String(formData.get("kind") ?? "STUDENT") as "STUDENT" | "ADVISOR") || "STUDENT"
  const affiliation = String(formData.get("affiliation") ?? "").trim()
  if (!name || !email) throw new Error("Name and email are required")
  await db.directoryPerson.upsert({
    where: { email },
    update: { name, kind, affiliation: affiliation || null },
    create: { name, email, kind, affiliation: affiliation || null },
  })
  revalidateAdmin()
}

// ─── Institution (OSE) access ─────────────────────────────────────────────────

export async function adminGrantInstitutionRole(formData: FormData) {
  const { institutionId } = await requireCapability("institution.grantRole", {
    resourceType: "InstitutionMembership",
  })
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const role = String(formData.get("role") ?? "") as InstitutionRole
  if (!email) throw new Error("Email is required")
  if (!INSTITUTION_ROLES.includes(role)) throw new Error("Pick a role")

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: email.split("@")[0] },
  })
  await db.institutionMembership.upsert({
    where: { userId_institutionId: { userId: user.id, institutionId } },
    update: { role },
    create: { userId: user.id, institutionId, role },
  })
  await notifyUsers([user.id], {
    title: "You've been granted OSE administrator access",
    body: `Role: ${role.replace("OSE_", "").toLowerCase()}. The Admin console is now available to you.`,
    href: "/admin",
  })
  revalidateAdmin()
}

// ─── Approvals: force-decide (override the gates) ─────────────────────────────

export async function adminDecideApproval(formData: FormData) {
  const approvalId = String(formData.get("approvalId") ?? "")
  const decision = String(formData.get("decision") ?? "") as "APPROVED" | "REJECTED"
  const approval = await db.approvalRequest.findUnique({
    where: { id: approvalId },
    include: { event: { select: { id: true, title: true } } },
  })
  if (!approval) throw new Error("Request not found")
  const { userId } = await requireCapability("approval.override", {
    institutionId: approval.institutionId,
    organizationId: approval.organizationId,
    resourceType: "ApprovalRequest",
    resourceId: approvalId,
    reason: "OSE override",
  })
  if (!["APPROVED", "REJECTED"].includes(decision)) throw new Error("Invalid decision")
  if (["APPROVED", "REJECTED", "CANCELLED"].includes(approval.status))
    throw new Error("This request is already decided")

  await db.$transaction([
    db.approvalRequest.update({ where: { id: approvalId }, data: { status: decision } }),
    db.approvalStep.create({
      data: {
        approvalId,
        fromStatus: approval.status,
        toStatus: decision,
        actorId: userId,
        actorRoleContext: "OSE Override",
        reason: "Administrator override",
        policySnapshot: { override: true },
      },
    }),
    ...(approval.event && decision === "APPROVED"
      ? [db.event.update({ where: { id: approval.event.id }, data: { status: "PUBLISHED" } })]
      : []),
    ...(approval.event && decision === "REJECTED"
      ? [db.event.update({ where: { id: approval.event.id }, data: { status: "CANCELLED" } })]
      : []),
  ])

  await notifyUsers([approval.submittedById], {
    title: `“${approval.title}” was ${decision === "APPROVED" ? "approved" : "rejected"} by OSE`,
    body: "An administrator decided this request directly.",
    href: `/approvals/${approvalId}`,
    excludeUserId: userId,
  })
  revalidateAdmin()
  revalidatePath("/admin/approvals")
  revalidatePath("/approvals")
  revalidatePath(`/approvals/${approvalId}`)
}

export async function adminRevokeInstitutionRole(formData: FormData) {
  const { institutionId, userId: actorId } = await requireCapability("institution.grantRole", {
    resourceType: "InstitutionMembership",
  })
  const membershipId = String(formData.get("membershipId") ?? "")
  const membership = await db.institutionMembership.findUnique({ where: { id: membershipId } })
  if (!membership || membership.institutionId !== institutionId)
    throw new Error("Membership not found")

  // Never remove the last director — the institution must keep an owner.
  if (membership.role === "OSE_DIRECTOR") {
    const directors = await db.institutionMembership.count({
      where: { institutionId, role: "OSE_DIRECTOR" },
    })
    if (directors <= 1) throw new Error("Cannot remove the last OSE Director")
  }
  await db.institutionMembership.delete({ where: { id: membershipId } })
  if (membership.userId !== actorId)
    await notifyUsers([membership.userId], {
      title: "Your OSE administrator access was removed",
    })
  revalidateAdmin()
}
