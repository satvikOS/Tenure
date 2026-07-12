import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { Card, CardHeader, Attribute } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"

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
    activeSeats,
    shadowSeats,
    approvalsByStatus,
    decidedSteps,
    publishedEvents,
    hardConflicts,
    memoryByType,
    documents,
    deniedActions,
  ] = await Promise.all([
    db.organization.count({ where: { institutionId, status: "ACTIVE" } }),
    db.roleAssignment.count({
      where: { status: "ACTIVE", role: { organization: { institutionId } } },
    }),
    db.roleAssignment.count({
      where: { status: "SHADOW", role: { organization: { institutionId } } },
    }),
    db.approvalRequest.groupBy({
      by: ["status"],
      where: { institutionId },
      _count: true,
    }),
    db.approvalStep.findMany({
      where: {
        approval: { institutionId },
        toStatus: { in: ["APPROVED", "REJECTED"] },
      },
      select: { occurredAt: true, approval: { select: { createdAt: true } } },
    }),
    db.event.count({ where: { institutionId, status: "PUBLISHED" } }),
    db.conflictRecord.count({
      where: { severity: "HARD", resolved: false, event: { institutionId } },
    }),
    db.memoryRecord.groupBy({
      by: ["type"],
      where: { institutionId, isArchived: false },
      _count: true,
    }),
    db.document.count({ where: { institutionId, isArchived: false } }),
    db.auditEvent.findMany({
      where: { institutionId, outcome: "DENY" },
      orderBy: { occurredAt: "desc" },
      take: 8,
    }),
  ])

  const statusCount = (s: string) =>
    approvalsByStatus.find((a) => a.status === s)?._count ?? 0
  const pending = statusCount("PENDING_PRESIDENT") + statusCount("PENDING_OSE")

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

  const totalMemory = memoryByType.reduce((n, m) => n + m._count, 0)

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
    <div className="max-w-screen-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-1">Reports</h1>
        <p className="text-sm text-text-2 mt-1">
          Institution-wide operational picture — live from the system of record.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <p className="text-2xl font-bold text-text-1">{orgs}</p>
          <p className="text-xs text-text-2 mt-0.5">Active clubs</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-text-1">{activeSeats}</p>
          <p className="text-xs text-text-2 mt-0.5">Filled seats</p>
          <p className="text-xs text-text-3 mt-1">{shadowSeats} incoming (shadow)</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-text-1">{pending}</p>
          <p className="text-xs text-text-2 mt-0.5">Approvals awaiting decision</p>
          <p className="text-xs text-text-3 mt-1">median time to decision {medianLabel}</p>
        </Card>
        <Card>
          <p className="text-2xl font-bold text-text-1">{publishedEvents}</p>
          <p className="text-xs text-text-2 mt-0.5">Published events</p>
          <p className="text-xs text-text-3 mt-1">
            {hardConflicts} unresolved hard conflict{hardConflicts === 1 ? "" : "s"}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="Approval pipeline"
            subtitle="Requests by state across all clubs"
          />
          <div className="grid grid-cols-2 gap-3">
            <Attribute label="Draft" value={statusCount("DRAFT")} />
            <Attribute label="Pending President" value={statusCount("PENDING_PRESIDENT")} />
            <Attribute label="Pending OSE" value={statusCount("PENDING_OSE")} />
            <Attribute label="Needs Changes" value={statusCount("NEEDS_CHANGES")} />
            <Attribute label="Approved" value={statusCount("APPROVED")} />
            <Attribute label="Rejected" value={statusCount("REJECTED")} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Institutional memory"
            subtitle={`${totalMemory} knowledge cards + ${documents} documents preserved`}
          />
          {memoryByType.length === 0 ? (
            <p className="text-sm text-text-3">No memory captured yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {memoryByType.map((m) => (
                <Attribute
                  key={m.type}
                  label={m.type.toLowerCase()}
                  value={m._count}
                />
              ))}
            </div>
          )}
        </Card>

        <Card padding="none" className="lg:col-span-2">
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
