import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { capSeatNames, summariseSeats, summariseSeatsByName } from "@/lib/seats"
import { institutionSeatsWhere, loadSeatFacts } from "@/lib/seats-data"
import { Building2, Users, CheckCircle, CalendarCheck, DollarSign } from "@/components/ui/icons"
import { Card, CardHeader } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { PageHeader } from "@/components/ui/PageHeader"
import { StatGrid, StatTile } from "@/components/ui/Bento"
import { ReportsAnalytics } from "@/components/charts/panels/ReportsAnalytics"
import { LiveStats } from "@/components/charts/LiveStats"

export const dynamic = "force-dynamic"

/** OSE-only institution reporting (blueprint §Reporting & Admin). */
export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const ctx = await getUserContext(session.user.id)
  const institutionId = ctx.institutionRoles[0]?.institutionId
  if (!institutionId) notFound() // OSE only

  const [
    orgs,
    seatFacts,
    approvals,
    decidedSteps,
    eventRows,
    hardConflicts,
    memory,
    deniedActions,
  ] = await Promise.all([
    db.organization.count({ where: { institutionId, status: "ACTIVE" } }),
    // One seat query feeds BOTH the headline tile and the roster chart, so they
    // cannot drift apart again (see src/lib/seats.ts for the rules).
    loadSeatFacts(institutionSeatsWhere(institutionId)),
    db.approvalRequest.findMany({
      where: { institutionId },
      select: { status: true, createdAt: true },
    }),
    db.approvalStep.findMany({
      where: {
        approval: { institutionId },
        toStatus: { in: ["APPROVED", "REJECTED"] },
      },
      select: { occurredAt: true, approval: { select: { createdAt: true } } },
    }),
    db.event.findMany({
      where: { institutionId, status: "PUBLISHED" },
      select: { createdAt: true },
    }),
    db.conflictRecord.count({
      where: { severity: "HARD", resolved: false, event: { institutionId } },
    }),
    db.memoryRecord.findMany({
      where: { institutionId, isArchived: false },
      select: { type: true, createdAt: true },
    }),
    db.auditEvent.findMany({
      where: { institutionId, outcome: "DENY" },
      orderBy: { occurredAt: "desc" },
      take: 8,
    }),
  ])

  const statusCount = (s: string) => approvals.filter((a) => a.status === s).length
  const pending = statusCount("PENDING_PRESIDENT") + statusCount("PENDING_OSE")
  const publishedEvents = eventRows.length

  // Median hours from request creation to final decision
  const durations = decidedSteps
    .map((s) => s.occurredAt.getTime() - s.approval.createdAt.getTime())
    .sort((a, b) => a - b)
  const medianMs = durations.length
    ? durations[Math.floor(durations.length / 2)]
    : null
  const medianLabel =
    medianMs === null
      ? "—"
      : medianMs < 36e5
        ? `${Math.max(1, Math.round(medianMs / 6e4))} min`
        : `${(medianMs / 36e5).toFixed(1)} h`

  // The headline and the roster chart are two views of the SAME tally: the chart
  // is `summariseSeatsByName` of the seats the tile summarises, capped with a
  // rolled-up tail rather than truncated, so its columns still sum to the tile.
  const seats = summariseSeats(seatFacts)
  const roster = capSeatNames(summariseSeatsByName(seatFacts), 8).map((r) => ({
    category: r.name,
    filled: r.filled,
    incoming: r.incoming,
    vacant: r.vacant,
  }))

  // Serialise the record streams the analytics panel re-aggregates client-side.
  const approvalsSeries = approvals.map((a) => ({
    status: a.status,
    createdAt: a.createdAt.toISOString(),
  }))
  const decisionsSeries = decidedSteps.map((s) => ({
    occurredAt: s.occurredAt.toISOString(),
    durationMs: s.occurredAt.getTime() - s.approval.createdAt.getTime(),
  }))
  const eventDates = eventRows.map((e) => e.createdAt.toISOString())
  const memorySeries = memory.map((m) => ({
    type: m.type,
    createdAt: m.createdAt.toISOString(),
  }))

  const deniedActors = new Map<string, string>()
  const actorIds = [...new Set(deniedActions.map((d) => d.actorId).filter((x): x is string => !!x))]
  if (actorIds.length) {
    for (const u of await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    }))
      deniedActors.set(u.id, u.name ?? u.email ?? "Unknown")
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Reports"
        subtitle="Institution-wide operational picture — live from the system of record."
        actions={
          <Link
            href="/reports/finance"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-text-2 no-underline transition-colors hover:bg-surface hover:text-text-1"
          >
            <DollarSign size={15} /> Finance portfolio
          </Link>
        }
      />

      <div className="mb-6">
        <StatGrid>
          <StatTile label="Active clubs" value={orgs} icon={Building2} />
          <StatTile
            label="Filled seats"
            value={`${seats.filled}/${seats.total}`}
            hint={`${seats.vacant} vacant · ${seats.incoming} incoming (shadow)`}
            icon={Users}
          />
          <StatTile
            label="Approvals awaiting decision"
            value={pending}
            hint={`median time to decision ${medianLabel}`}
            icon={CheckCircle}
          />
          <StatTile
            label="Published events"
            value={publishedEvents}
            hint={`${hardConflicts} unresolved hard conflict${hardConflicts === 1 ? "" : "s"}`}
            icon={CalendarCheck}
          />
        </StatGrid>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <LiveStats
          endpoint="/api/reports/pulse"
          intervalMs={15000}
          initial={{ pending, publishedEvents, filledSeats: seats.filled, hardConflicts }}
          items={[
            { key: "pending", label: "Open approvals" },
            { key: "filledSeats", label: "Seats filled" },
            { key: "publishedEvents", label: "On the calendar" },
            { key: "hardConflicts", label: "Hard conflicts", tone: "warn" },
          ]}
        />
      </div>

      <ReportsAnalytics
        approvals={approvalsSeries}
        decisions={decisionsSeries}
        eventDates={eventDates}
        memory={memorySeries}
        roster={roster}
      />

      <div className="mt-5 grid grid-cols-1 gap-5">
        <Card padding="none">
          <div className="p-5 border-b border-border">
            <CardHeader
              title="Denied actions"
              subtitle="Permission boundaries doing their job — from the audit log"
            />
          </div>
          {deniedActions.length === 0 ? (
            <p className="px-5 py-6 text-sm text-text-3 text-center">
              No denied actions recorded.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {deniedActions.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <Badge variant="error">DENY</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-1">
                      {d.actorId ? deniedActors.get(d.actorId) : "Unknown"} — {d.action}
                      {d.reason ? ` (${d.reason})` : ""}
                    </p>
                    <p className="text-xs text-text-3 mt-0.5">
                      {d.occurredAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
