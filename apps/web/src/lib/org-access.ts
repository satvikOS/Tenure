import "server-only"
import type { OrgStatus, Prisma } from "@prisma/client"
import { db } from "@/lib/db"

/**
 * The archive guard — the single definition of "this club is still operable".
 *
 * Archiving a club was a bare `status` flip on Organization: /orgs stopped
 * listing it, and nothing else changed. Every ACTIVE RoleAssignment survived,
 * so its officers kept full write access — the dashboard still scoped its KPIs
 * to the club, the settings delegation form still let its president name a
 * backup approver, and /calendar/new and /approvals/new still offered it in the
 * club picker. "Archived" meant "hidden from one page".
 *
 * Revoking the assignments would close the hole and destroy the record of who
 * held which seat, which is the thing Tenure exists to preserve. So the club is
 * gated instead of the roster: one predicate that operational READS (which
 * clubs appear in a picker, which ids feed a KPI) and WRITES (create an event,
 * a request, a delegation) both go through.
 *
 * Historical surfaces are deliberately NOT gated by this: an archived club's
 * past approvals, events and seat history stay readable. Archiving ends a
 * club's operations, it does not erase what it did.
 */

/**
 * ARCHIVED is the only status that closes a club down. PENDING is a club still
 * awaiting its charter decision — live business, and it shows in the active
 * grid on /orgs, so it stays operable here too.
 */
export function isOperableOrg(org: { status: OrgStatus }): boolean {
  return org.status !== "ARCHIVED"
}

/** Prisma `where` fragment for the read half of the guard. */
export const OPERABLE_ORG_FILTER = {
  status: { not: "ARCHIVED" },
} as const satisfies Prisma.OrganizationWhereInput

export const ARCHIVED_ORG_MESSAGE =
  "That club is archived. Ask your OSE office to reactivate it before making changes."

/** Write half of the guard: refuse the operation rather than filter it away. */
export function assertOperableOrg(org: { status: OrgStatus }): void {
  if (!isOperableOrg(org)) throw new Error(ARCHIVED_ORG_MESSAGE)
}

/** Drop archived clubs from an already-loaded list. */
export function filterOperableOrgs<T extends { status: OrgStatus }>(orgs: T[]): T[] {
  return orgs.filter(isOperableOrg)
}

/**
 * Narrow a set of club ids to the ones still operable. For call sites that
 * derive ids from `UserContext` (which carries seats, not club status) and so
 * have no Organization row to test.
 */
export async function operableOrgIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db.organization.findMany({
    where: { id: { in: ids }, ...OPERABLE_ORG_FILTER },
    select: { id: true },
  })
  return rows.map((o) => o.id)
}
