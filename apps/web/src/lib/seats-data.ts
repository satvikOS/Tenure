import "server-only"
import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { CURRENT_ACADEMIC_TERM, toSeatFacts, type OrgSeatFacts } from "@/lib/seats"

/**
 * The query shape seat truth needs, and the loader that produces it.
 *
 * The rules and the adapter live in `seats.ts` and are pure; this file is the
 * only place that touches Prisma. It exists so every read site also issues the
 * SAME query — a page that selects only `_count`, or only ACTIVE assignments,
 * cannot compute the canonical answer no matter which function it then calls.
 */

/**
 * Rows the rules can be evaluated against. Pre-filtered to the ones that can
 * possibly matter — ALUMNI assignments and ended/prior-term holdings are dropped
 * in SQL — but the pure predicates re-check anyway, so a caller that supplies a
 * wider payload (the handoff page needs past holdings for the predecessor
 * contact) still gets the same verdict.
 */
export const seatFactsInclude = {
  assignments: {
    where: { status: { in: ["ACTIVE", "SHADOW"] } },
    select: { status: true, user: { select: { id: true, name: true, email: true } } },
  },
  holdings: {
    where: { isCurrent: true, term: CURRENT_ACADEMIC_TERM },
    select: {
      isCurrent: true,
      term: true,
      person: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.RoleInclude

/**
 * Every seat OSE operates at an institution. Archived clubs are excluded here
 * rather than at each call site — that is rule 4, and it is not a per-page
 * choice.
 */
export function institutionSeatsWhere(institutionId: string): Prisma.RoleWhereInput {
  return { organization: { institutionId, status: { not: "ARCHIVED" } } }
}

/** Every seat across a set of clubs, archived ones excluded. */
export function orgSeatsWhere(organizationIds: string[]): Prisma.RoleWhereInput {
  return { organization: { id: { in: organizationIds }, status: { not: "ARCHIVED" } } }
}

/** Load seat facts for any set of seats, ready for the pure summarisers. */
export async function loadSeatFacts(where: Prisma.RoleWhereInput): Promise<OrgSeatFacts[]> {
  const roles = await db.role.findMany({
    where,
    select: { organizationId: true, name: true, ...seatFactsInclude },
  })
  return roles.map((role) => ({ organizationId: role.organizationId, ...toSeatFacts(role) }))
}
