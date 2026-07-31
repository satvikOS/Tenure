import type { ConflictSeverity, EventStatus } from "@prisma/client"

/**
 * ─── What counts as an event on the shared calendar ──────────────────────────
 *
 * The dashboard's "Upcoming Events" tile counted every future row for a club
 * regardless of status, under a hint reading "On the shared calendar". So an
 * unsubmitted DRAFT, a proposal still sitting at a gate, and an event that had
 * been CANCELLED all inflated a number that claimed the institution had agreed
 * to them — while /reports, counting PUBLISHED only, reported a different total
 * for the same clubs.
 *
 * An event reaches the calendar when it clears the approval chain: APPROVED
 * (decided) or PUBLISHED (decided and announced). Both are commitments the
 * institution has made; everything before them is a proposal.
 *
 * Nothing is silently dropped: proposals awaiting a decision are counted by
 * `isPendingProposal` and reported as their own number. DRAFT is excluded from
 * both — a draft has not been shown to anyone, so it is neither scheduled nor
 * waiting on an approver.
 */
export const CALENDARED_EVENT_STATUSES: EventStatus[] = ["APPROVED", "PUBLISHED"]
export const PENDING_EVENT_STATUSES: EventStatus[] = ["PENDING_APPROVAL"]

/** True when this event is a commitment on the institution's shared calendar. */
export function isOnSharedCalendar(status: EventStatus): boolean {
  return CALENDARED_EVENT_STATUSES.includes(status)
}

/** True when this event is a proposal still awaiting an approval decision. */
export function isPendingProposal(status: EventStatus): boolean {
  return PENDING_EVENT_STATUSES.includes(status)
}

/**
 * Conflict detection (blueprint §Calendar):
 *  - HARD          same venue at an overlapping time, or the same club
 *                  double-booking itself — approvers should block
 *  - SOFT          another club overlaps in time — audience competition, warn
 *  - INFORMATIONAL another event the same day without a time overlap
 */

export interface CalendarEventLike {
  id: string
  organizationId: string
  title: string
  startAt: Date
  endAt: Date
  venue?: string | null
}

export interface DetectedConflict {
  conflictWithEventId: string
  severity: ConflictSeverity
  reason: string
}

export function overlaps(a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

function normalizeVenue(v?: string | null): string | null {
  const s = v?.trim().toLowerCase()
  return s ? s : null
}

/**
 * Compare a proposed event against existing events (same institution,
 * excluding cancelled ones) and classify each collision.
 */
export function detectConflicts(
  proposed: Omit<CalendarEventLike, "id"> & { id?: string },
  existing: CalendarEventLike[]
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = []
  const venue = normalizeVenue(proposed.venue)

  for (const other of existing) {
    if (proposed.id && other.id === proposed.id) continue

    if (overlaps(proposed, other)) {
      const otherVenue = normalizeVenue(other.venue)
      if (venue && otherVenue && venue === otherVenue) {
        conflicts.push({
          conflictWithEventId: other.id,
          severity: "HARD",
          reason: `Venue clash: “${other.title}” is booked in ${other.venue} at the same time`,
        })
      } else if (other.organizationId === proposed.organizationId) {
        conflicts.push({
          conflictWithEventId: other.id,
          severity: "HARD",
          reason: `Double booking: your club already has “${other.title}” at this time`,
        })
      } else {
        conflicts.push({
          conflictWithEventId: other.id,
          severity: "SOFT",
          reason: `Overlaps “${other.title}” — students may have to choose between them`,
        })
      }
    } else if (sameDay(proposed.startAt, other.startAt)) {
      conflicts.push({
        conflictWithEventId: other.id,
        severity: "INFORMATIONAL",
        reason: `Same day as “${other.title}”`,
      })
    }
  }

  // HARD first, then SOFT, then INFORMATIONAL
  const rank: Record<ConflictSeverity, number> = { HARD: 0, SOFT: 1, INFORMATIONAL: 2 }
  return conflicts.sort((a, b) => rank[a.severity] - rank[b.severity])
}
