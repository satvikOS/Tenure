import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { summariseSeats } from "@/lib/seats"
import { institutionSeatsWhere, loadSeatFacts } from "@/lib/seats-data"

export const dynamic = "force-dynamic"

/**
 * Lightweight live-metrics endpoint for the Reports "Live now" strip. OSE-only,
 * mirrors the headline counts on /reports so the tiles can poll and update
 * without a full page reload. No-store so every poll is fresh.
 *
 * "Mirrors" is enforced, not hoped for: the seat number comes from the same
 * canonical summariser the page renders, so a poll can never replace the
 * server-rendered figure with one computed a different way.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  }
  const ctx = await getUserContext(session.user.id)
  const institutionId = ctx.institutionRoles[0]?.institutionId
  if (!institutionId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const [pendingPresident, pendingOse, publishedEvents, seatFacts, hardConflicts] = await Promise.all([
    db.approvalRequest.count({ where: { institutionId, status: "PENDING_PRESIDENT" } }),
    db.approvalRequest.count({ where: { institutionId, status: "PENDING_OSE" } }),
    db.event.count({ where: { institutionId, status: "PUBLISHED" } }),
    loadSeatFacts(institutionSeatsWhere(institutionId)),
    db.conflictRecord.count({ where: { severity: "HARD", resolved: false, event: { institutionId } } }),
  ])
  const seats = summariseSeats(seatFacts)

  return NextResponse.json(
    {
      pending: pendingPresident + pendingOse,
      publishedEvents,
      filledSeats: seats.filled,
      hardConflicts,
    },
    { headers: { "cache-control": "no-store" } }
  )
}
