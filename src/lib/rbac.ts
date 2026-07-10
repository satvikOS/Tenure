import { cache } from "react"
import type { AssignmentStatus, InstitutionRole, RoleScope } from "@prisma/client"
import { db } from "@/lib/db"

// ─── User context ─────────────────────────────────────────────────────────────

export interface OrgRole {
  organizationId: string
  roleId: string
  roleName: string
  scope: RoleScope
  status: AssignmentStatus
}

export interface UserContext {
  userId: string
  /** Institution-level (OSE) memberships */
  institutionRoles: { institutionId: string; role: InstitutionRole }[]
  /** Club role assignments — all statuses, so callers can distinguish SHADOW/ALUMNI */
  orgRoles: OrgRole[]
}

/** Load everything permission checks need in one query round-trip per request. */
export const getUserContext = cache(async (userId: string): Promise<UserContext> => {
  const [memberships, assignments] = await Promise.all([
    db.institutionMembership.findMany({
      where: { userId },
      select: { institutionId: true, role: true },
    }),
    db.roleAssignment.findMany({
      where: { userId },
      select: {
        status: true,
        role: {
          select: { id: true, name: true, scope: true, organizationId: true },
        },
      },
    }),
  ])

  return {
    userId,
    institutionRoles: memberships,
    orgRoles: assignments.map((a) => ({
      organizationId: a.role.organizationId,
      roleId: a.role.id,
      roleName: a.role.name,
      scope: a.role.scope,
      status: a.status,
    })),
  }
})

// ─── Pure permission checks (no DB — unit-testable) ──────────────────────────

/** Any OSE membership at this institution (Director, Staff, or Advisor). */
export function isOse(ctx: UserContext, institutionId: string): boolean {
  return ctx.institutionRoles.some((m) => m.institutionId === institutionId)
}

export function isOseDirector(ctx: UserContext, institutionId: string): boolean {
  return ctx.institutionRoles.some(
    (m) => m.institutionId === institutionId && m.role === "OSE_DIRECTOR"
  )
}

function orgRolesFor(ctx: UserContext, organizationId: string): OrgRole[] {
  return ctx.orgRoles.filter((r) => r.organizationId === organizationId)
}

/**
 * View an org's workspace and roster.
 * OSE sees every club; members see their own club while SHADOW (read-only
 * preview before term start) or ACTIVE. ALUMNI records are preserved but
 * access is revoked.
 */
export function canViewOrg(
  ctx: UserContext,
  org: { id: string; institutionId: string }
): boolean {
  if (isOse(ctx, org.institutionId)) return true
  return orgRolesFor(ctx, org.id).some(
    (r) => r.status === "SHADOW" || r.status === "ACTIVE"
  )
}

/**
 * Manage the roster: create role seats, assign people, transition statuses.
 * OSE Director (institution-wide authority) or the club's ACTIVE President.
 * SHADOW presidents are read-only until their term begins.
 */
export function canManageRoster(
  ctx: UserContext,
  org: { id: string; institutionId: string }
): boolean {
  if (isOseDirector(ctx, org.institutionId)) return true
  return orgRolesFor(ctx, org.id).some(
    (r) => r.scope === "PRESIDENT" && r.status === "ACTIVE"
  )
}

/** List every organization at the institution (OSE-only view). */
export function canListAllOrgs(ctx: UserContext, institutionId: string): boolean {
  return isOse(ctx, institutionId)
}

/** Write to the org workspace (requests, events, documents) — ACTIVE members only. */
export function canContribute(
  ctx: UserContext,
  org: { id: string; institutionId: string }
): boolean {
  if (isOse(ctx, org.institutionId)) return true
  return orgRolesFor(ctx, org.id).some((r) => r.status === "ACTIVE")
}
