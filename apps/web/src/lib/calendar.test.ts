import type { EventStatus } from "@prisma/client"
import {
  detectConflicts,
  isOnSharedCalendar,
  isPendingProposal,
  overlaps,
  type CalendarEventLike,
} from "./calendar"

const d = (iso: string) => new Date(iso)

function evt(partial: Partial<CalendarEventLike> & { id: string }): CalendarEventLike {
  return {
    organizationId: "org_a",
    title: `Event ${partial.id}`,
    startAt: d("2026-10-01T18:00:00Z"),
    endAt: d("2026-10-01T20:00:00Z"),
    venue: null,
    ...partial,
  }
}

/**
 * What "Upcoming Events" is allowed to count.
 *
 * The dashboard tile counted every future row for a club — DRAFT,
 * PENDING_APPROVAL and CANCELLED included — under a hint reading "On the shared
 * calendar", while /reports counted PUBLISHED only and reported a different
 * number for the same clubs. These tests pin the single definition both use.
 */
describe("event status predicates", () => {
  const ALL: EventStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PUBLISHED", "CANCELLED"]

  it("counts only events that cleared the approval chain as scheduled", () => {
    expect(ALL.filter(isOnSharedCalendar)).toEqual(["APPROVED", "PUBLISHED"])
  })

  it("keeps a cancelled event off the calendar", () => {
    // The row survives cancellation (an approval rejection sets CANCELLED), so
    // a date filter alone still returns it.
    expect(isOnSharedCalendar("CANCELLED")).toBe(false)
    expect(isPendingProposal("CANCELLED")).toBe(false)
  })

  it("counts a proposal awaiting a decision as pending, not as scheduled", () => {
    expect(ALL.filter(isPendingProposal)).toEqual(["PENDING_APPROVAL"])
  })

  it("treats a draft as neither scheduled nor pending — nobody has seen it", () => {
    expect(isOnSharedCalendar("DRAFT")).toBe(false)
    expect(isPendingProposal("DRAFT")).toBe(false)
  })

  it("never counts one status in both buckets", () => {
    // Headline + "awaiting approval" are shown side by side on one tile, so an
    // overlap would double-count an event in a single sentence.
    expect(ALL.filter((s) => isOnSharedCalendar(s) && isPendingProposal(s))).toEqual([])
  })
})

describe("overlaps", () => {
  it("detects genuine overlap and rejects back-to-back bookings", () => {
    const a = { startAt: d("2026-10-01T18:00:00Z"), endAt: d("2026-10-01T20:00:00Z") }
    expect(overlaps(a, { startAt: d("2026-10-01T19:00:00Z"), endAt: d("2026-10-01T21:00:00Z") })).toBe(true)
    expect(overlaps(a, { startAt: d("2026-10-01T20:00:00Z"), endAt: d("2026-10-01T22:00:00Z") })).toBe(false)
    expect(overlaps(a, { startAt: d("2026-10-01T16:00:00Z"), endAt: d("2026-10-01T18:00:00Z") })).toBe(false)
  })
})

describe("detectConflicts", () => {
  const proposed = {
    organizationId: "org_a",
    title: "Case Prep Night",
    startAt: d("2026-10-01T18:00:00Z"),
    endAt: d("2026-10-01T20:00:00Z"),
    venue: "Schlegel 203",
  }

  it("flags same-venue overlap as HARD even across clubs", () => {
    const found = detectConflicts(proposed, [
      evt({ id: "e1", organizationId: "org_b", venue: "schlegel 203" }),
    ])
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe("HARD")
    expect(found[0].reason).toMatch(/Venue clash/)
  })

  it("flags own-club overlap as HARD even in different venues", () => {
    const found = detectConflicts(proposed, [
      evt({ id: "e2", organizationId: "org_a", venue: "Gleason 118" }),
    ])
    expect(found[0].severity).toBe("HARD")
    expect(found[0].reason).toMatch(/Double booking/)
  })

  it("flags cross-club time overlap as SOFT", () => {
    const found = detectConflicts(proposed, [
      evt({ id: "e3", organizationId: "org_b", venue: "Gleason 118" }),
    ])
    expect(found[0].severity).toBe("SOFT")
  })

  it("flags same-day non-overlap as INFORMATIONAL", () => {
    const found = detectConflicts(proposed, [
      evt({
        id: "e4",
        organizationId: "org_b",
        startAt: d("2026-10-01T21:00:00Z"),
        endAt: d("2026-10-01T22:00:00Z"),
      }),
    ])
    expect(found[0].severity).toBe("INFORMATIONAL")
  })

  it("ignores different days and the event itself", () => {
    expect(
      detectConflicts(proposed, [
        evt({ id: "e5", startAt: d("2026-10-02T18:00:00Z"), endAt: d("2026-10-02T20:00:00Z") }),
      ])
    ).toHaveLength(0)
    expect(
      detectConflicts({ ...proposed, id: "self" }, [evt({ id: "self" })])
    ).toHaveLength(0)
  })

  it("sorts HARD before SOFT before INFORMATIONAL", () => {
    const found = detectConflicts(proposed, [
      evt({
        id: "info",
        organizationId: "org_b",
        startAt: d("2026-10-01T21:30:00Z"),
        endAt: d("2026-10-01T22:00:00Z"),
      }),
      evt({ id: "soft", organizationId: "org_b", venue: "Gleason 118" }),
      evt({ id: "hard", organizationId: "org_b", venue: "Schlegel 203" }),
    ])
    expect(found.map((c) => c.severity)).toEqual(["HARD", "SOFT", "INFORMATIONAL"])
  })
})
