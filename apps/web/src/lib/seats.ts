/**
 * Seat truth — the ONE definition of a filled board seat.
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 * Four different definitions of "filled" had grown up across the product, so a
 * single club could truthfully report 4/9, 8/9 and "3 active members" on three
 * pages at once:
 *
 *   A. any history at all — `_count.assignments > 0 || _count.holdings > 0`,
 *      unfiltered by status or currentness (admin clubs list). An ALUMNI row or
 *      a holding from two years ago made a vacant seat look filled.
 *   B. rows, not seats — `count(RoleAssignment where status = ACTIVE)` (reports
 *      headline, /api/reports/pulse, admin overview tile, impact "active
 *      members", dashboard). Counts people not seats, so two co-holders read as
 *      two filled seats; ignores directory SeatHoldings entirely; includes the
 *      generic "Member" bucket and archived clubs.
 *   C. shadow counted as filled — ACTIVE *or* SHADOW assignment, or a current
 *      holding (reports roster chart, admin vacancy count, per-seat "Vacant"
 *      badges). An incoming successor made the seat look staffed today.
 *   D. current holder — ACTIVE assignment or current holding (handoff, /orgs
 *      cards, admin donut), re-implemented inline at each site.
 *
 * ── The decision ────────────────────────────────────────────────────────────
 * Definition D is the truth, stated once, here, and every surface reads it:
 *
 *   1. A seat is FILLED when it has a CURRENT HOLDER — a RoleAssignment with
 *      status ACTIVE, or a SeatHolding that is current for the present academic
 *      term. Nothing else fills a seat.
 *   2. SHADOW / incoming is reported SEPARATELY and is never folded into
 *      filled. An incoming successor is a plan, not a staffed seat.
 *   3. ALUMNI assignments and ended holdings never count. "Ended" means
 *      `isCurrent = false` OR a term other than the present one — a row left
 *      flagged current from a prior term is stale data, not a holder.
 *   4. Archived organizations are excluded from operational counts. (A club's
 *      own pages still report its own seats; the rule is about institution-wide
 *      aggregates, which describe what OSE operates today.)
 *   5. The unit is THE SEAT, not the row. A seat with both a current
 *      SeatHolding and an ACTIVE RoleAssignment — the ordinary case, because
 *      the OSE roster and the login account are two records of one human —
 *      counts exactly ONCE. This is the case that produced the contradiction.
 *   6. The generic "Member" seat is a membership bucket, not a board seat, so
 *      it is excluded from seat counts. It still counts for PEOPLE metrics
 *      (`countCurrentHolders`), because a general member is a member.
 *
 * Everything here is pure and framework-free so the same answer is computed on
 * a server component, an API route and in tests. The Prisma query shape that
 * feeds it lives in `seats-data.ts`, which is the only file that touches the
 * database.
 */

import type { AssignmentStatus } from "@prisma/client"

/**
 * The academic term seat holdings are read against. Holdings from any other
 * term are history, whatever their `isCurrent` flag says.
 *
 * Must track `CURRENT_TERM` in scripts/roster-data.mjs, which is what the seed
 * writes. The scripts ship as ESM into the runtime image and cannot import this
 * module, so the pair is kept in step by hand — if they ever diverge, every
 * roster-held seat reads vacant at once.
 */
export const CURRENT_ACADEMIC_TERM = "2026-2027"

/** The generic membership seat every club carries — a bucket, not a board seat. */
export const GENERAL_MEMBER_SEAT = "Member"

/** Who is in a seat. `key` is a stable identity so one human is counted once. */
export interface SeatHolderFact {
  /** Email where known, else a row id. Compared case-insensitively. */
  key?: string | null
  name?: string | null
  /** Contact address, for surfaces that render a mailto — never an id. */
  email?: string | null
  /** Academic term, when the holder is known from the roster rather than a login. */
  term?: string | null
}

export interface SeatAssignmentFact extends SeatHolderFact {
  status: AssignmentStatus
}

export interface SeatHoldingFact extends SeatHolderFact {
  isCurrent: boolean
  term: string
}

/** The minimum a caller must supply for a seat to be judged. */
export interface SeatFacts {
  name: string
  assignments: SeatAssignmentFact[]
  holdings: SeatHoldingFact[]
}

/** Mutually exclusive, and the only three states a board seat can be in. */
export type SeatState = "FILLED" | "INCOMING" | "VACANT"

export interface SeatSummary {
  /** Board seats in scope. `filled + incoming + vacant === total`. */
  total: number
  filled: number
  /** Vacant today, with a shadow successor already lined up. */
  incoming: number
  vacant: number
  /**
   * Board seats with a shadow successor, whether or not they are filled today.
   * Reported alongside `filled`, never inside it (rule 2).
   */
  withSuccessor: number
  /** Whole-percent of board seats that have a current holder. */
  fillPct: number
}

/** Rule 6 — the generic membership bucket is not a board seat. */
export function isBoardSeat(seat: { name: string }): boolean {
  return seat.name !== GENERAL_MEMBER_SEAT
}

/** Rule 3 — a holding counts only while it is current AND for this term. */
export function holdingIsCurrent(
  holding: SeatHoldingFact,
  term: string = CURRENT_ACADEMIC_TERM
): boolean {
  return holding.isCurrent && holding.term === term
}

/**
 * Rule 1 — the seat has a current holder. Deliberately OR, and deliberately
 * evaluated per seat rather than per row, so the both-records case counts once.
 */
export function seatIsFilled(seat: SeatFacts, term: string = CURRENT_ACADEMIC_TERM): boolean {
  return (
    seat.assignments.some((a) => a.status === "ACTIVE") ||
    seat.holdings.some((h) => holdingIsCurrent(h, term))
  )
}

/** Rule 2 — a shadow successor is lined up for a seat nobody holds today. */
export function seatIsIncoming(seat: SeatFacts, term: string = CURRENT_ACADEMIC_TERM): boolean {
  return !seatIsFilled(seat, term) && seat.assignments.some((a) => a.status === "SHADOW")
}

/** Whether a successor is shadowing this seat — filled or not. */
export function seatHasSuccessor(seat: SeatFacts): boolean {
  return seat.assignments.some((a) => a.status === "SHADOW")
}

export function seatState(seat: SeatFacts, term: string = CURRENT_ACADEMIC_TERM): SeatState {
  if (seatIsFilled(seat, term)) return "FILLED"
  if (seatIsIncoming(seat, term)) return "INCOMING"
  return "VACANT"
}

/**
 * The person in the seat right now, or null if it is empty. The OSE roster
 * (SeatHolding) is the system of record for who sits in a seat, so it wins over
 * the login account when both exist — they are the same human either way.
 */
export function currentHolder(
  seat: SeatFacts,
  term: string = CURRENT_ACADEMIC_TERM
): SeatHolderFact | null {
  return (
    seat.holdings.find((h) => holdingIsCurrent(h, term)) ??
    seat.assignments.find((a) => a.status === "ACTIVE") ??
    null
  )
}

/** The successor shadowing this seat, or null. Never presented as the holder. */
export function incomingHolder(seat: SeatFacts): SeatHolderFact | null {
  return seat.assignments.find((a) => a.status === "SHADOW") ?? null
}

/**
 * The most recent holder who is no longer current — the handoff contact.
 *
 * Sorted here rather than trusting the caller's `orderBy`, so "who had this job
 * last year" is the same person on every page. Only the roster carries dated
 * history; an ALUMNI login assignment has no term to rank it by.
 */
export function previousHolder(
  seat: SeatFacts,
  term: string = CURRENT_ACADEMIC_TERM
): SeatHolderFact | null {
  return (
    [...seat.holdings]
      .filter((h) => !holdingIsCurrent(h, term))
      .sort((a, b) => b.term.localeCompare(a.term))[0] ?? null
  )
}

/**
 * The headline numbers. Non-board seats are dropped here rather than by the
 * caller, so no surface can accidentally count the "Member" bucket as a seat.
 */
export function summariseSeats(
  seats: SeatFacts[],
  term: string = CURRENT_ACADEMIC_TERM
): SeatSummary {
  const board = seats.filter(isBoardSeat)
  let filled = 0
  let incoming = 0
  let withSuccessor = 0
  for (const seat of board) {
    const state = seatState(seat, term)
    if (state === "FILLED") filled++
    else if (state === "INCOMING") incoming++
    if (seatHasSuccessor(seat)) withSuccessor++
  }
  return {
    total: board.length,
    filled,
    incoming,
    vacant: board.length - filled - incoming,
    withSuccessor,
    fillPct: board.length > 0 ? Math.round((filled / board.length) * 100) : 0,
  }
}

export interface SeatNameSummary {
  name: string
  filled: number
  incoming: number
  vacant: number
  total: number
}

/**
 * The same tally grouped by seat name — "President", "VP Finance", … — for the
 * roster-fill chart. Sorted by size so the busiest categories lead; ties break
 * on name so the chart does not reshuffle between renders.
 */
export function summariseSeatsByName(
  seats: SeatFacts[],
  term: string = CURRENT_ACADEMIC_TERM
): SeatNameSummary[] {
  const byName = new Map<string, SeatNameSummary>()
  for (const seat of seats.filter(isBoardSeat)) {
    const row =
      byName.get(seat.name) ?? { name: seat.name, filled: 0, incoming: 0, vacant: 0, total: 0 }
    const state = seatState(seat, term)
    if (state === "FILLED") row.filled++
    else if (state === "INCOMING") row.incoming++
    else row.vacant++
    row.total++
    byName.set(seat.name, row)
  }
  return [...byName.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

/** Label for the rolled-up tail of a capped seat-name breakdown. */
export const OTHER_SEATS_LABEL = "Other seats"

/**
 * Cap a seat-name breakdown at `limit` rows, rolling the tail into one bucket
 * instead of dropping it.
 *
 * Truncation is why /reports could show a chart that did not add up to its own
 * headline: `.slice(0, 8)` silently discarded seats the tile had counted. The
 * rolled-up bucket keeps the invariant that summing the rows reproduces
 * `summariseSeats` exactly.
 */
export function capSeatNames(rows: SeatNameSummary[], limit: number): SeatNameSummary[] {
  if (limit < 1 || rows.length <= limit) return rows
  const head = rows.slice(0, limit - 1)
  const tail = rows.slice(limit - 1)
  const other = tail.reduce(
    (acc, r) => ({
      name: OTHER_SEATS_LABEL,
      filled: acc.filled + r.filled,
      incoming: acc.incoming + r.incoming,
      vacant: acc.vacant + r.vacant,
      total: acc.total + r.total,
    }),
    { name: OTHER_SEATS_LABEL, filled: 0, incoming: 0, vacant: 0, total: 0 }
  )
  return [...head, other]
}

/**
 * The identities of everyone currently holding a seat — the PEOPLE metric.
 *
 * Unlike the seat metrics this includes the generic "Member" bucket (rule 6): a
 * general member is a member. Deduplicated by identity, so the human who has
 * both a roster holding and a login assignment is one person, and someone
 * holding two seats in the same club is one person.
 */
export function currentHolderKeys(
  seats: SeatFacts[],
  term: string = CURRENT_ACADEMIC_TERM
): Set<string> {
  const keys = new Set<string>()
  const add = (holder: SeatHolderFact, fallback: string) => {
    const key = holder.key?.trim().toLowerCase()
    keys.add(key || fallback)
  }
  seats.forEach((seat, si) => {
    seat.assignments.forEach((a, ai) => {
      if (a.status === "ACTIVE") add(a, `assignment:${si}:${ai}`)
    })
    seat.holdings.forEach((h, hi) => {
      if (holdingIsCurrent(h, term)) add(h, `holding:${si}:${hi}`)
    })
  })
  return keys
}

/** How many distinct people currently hold a seat. */
export function countCurrentHolders(
  seats: SeatFacts[],
  term: string = CURRENT_ACADEMIC_TERM
): number {
  return currentHolderKeys(seats, term).size
}

// ─── Adapter: database rows → seat facts ─────────────────────────────────────

/**
 * What `toSeatFacts` accepts — structural on purpose, so each page can keep the
 * extra fields it renders (position codes, past holders, memory counts) and
 * still map through ONE adapter instead of re-deriving who holds a seat.
 */
export interface SeatFactsRole {
  name: string
  assignments?: {
    status: AssignmentStatus
    user?: { id?: string; name?: string | null; email?: string | null } | null
  }[]
  holdings?: {
    isCurrent: boolean
    term: string
    person?: { id?: string; name?: string | null; email?: string | null } | null
  }[]
}

/**
 * Email is the identity that spans a login account and a directory person — the
 * same human has a User row and a DirectoryPerson row, and only the address ties
 * them together. Falling back to the row id keeps two people we cannot identify
 * distinct rather than silently merging them into one.
 */
function holderFact(
  who: { id?: string; name?: string | null; email?: string | null } | null | undefined
): SeatHolderFact {
  return {
    key: who?.email ?? who?.id ?? null,
    name: who?.name ?? who?.email ?? null,
    email: who?.email ?? null,
  }
}

export function toSeatFacts(role: SeatFactsRole): SeatFacts {
  return {
    name: role.name,
    assignments: (role.assignments ?? []).map((a) => ({
      ...holderFact(a.user),
      status: a.status,
    })),
    // The row's own fields are written after the holder's, so a holding always
    // carries its real term — that is what makes `currentHolder(...).term`
    // meaningful on the handoff packet.
    holdings: (role.holdings ?? []).map((h) => ({
      ...holderFact(h.person),
      isCurrent: h.isCurrent,
      term: h.term,
    })),
  }
}

export type OrgSeatFacts = SeatFacts & { organizationId: string }

/** The same facts grouped by club, for any surface that renders a card per club. */
export function groupSeatFactsByOrg(rows: OrgSeatFacts[]): Map<string, SeatFacts[]> {
  const byOrg = new Map<string, SeatFacts[]>()
  for (const row of rows) {
    const list = byOrg.get(row.organizationId)
    if (list) list.push(row)
    else byOrg.set(row.organizationId, [row])
  }
  return byOrg
}
