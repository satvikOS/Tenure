import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canViewOrg, getUserContext, isOse } from "@/lib/rbac"
import { Card, CardHeader, Attribute } from "@/components/ui/Card"
import { EventBadge, SeverityBadge } from "@/components/ui/Badge"

export const dynamic = "force-dynamic"

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const event = await db.event.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true, institutionId: true } },
      conflicts: { orderBy: { createdAt: "asc" } },
      approval: { select: { id: true, status: true } },
    },
  })
  if (!event) notFound()

  const ctx = await getUserContext(session.user.id)
  const canView =
    isOse(ctx, event.institutionId) ||
    canViewOrg(ctx, { id: event.organizationId, institutionId: event.institutionId }) ||
    event.status === "PUBLISHED"
  if (!canView) notFound()

  // Resolve titles of conflicting events for context
  const conflictIds = event.conflicts
    .map((c) => c.conflictWithEventId)
    .filter((x): x is string => !!x)
  const conflictEvents = new Map(
    (
      await db.event.findMany({
        where: { id: { in: conflictIds } },
        select: { id: true, title: true, startAt: true },
      })
    ).map((e) => [e.id, e])
  )

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-1">{event.title}</h1>
          <p className="text-sm text-text-2 mt-1">{event.organization.name}</p>
        </div>
        <EventBadge status={event.status} />
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader title="Details" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Attribute
              label="Starts"
              value={event.startAt.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            />
            <Attribute
              label="Ends"
              value={event.endAt.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            />
            <Attribute label="Venue" value={event.venue ?? "—"} />
            <Attribute
              label="Approval"
              value={
                event.approval ? (
                  <Link
                    href={`/approvals/${event.approval.id}`}
                    className="text-[--primary] hover:underline"
                  >
                    View request
                  </Link>
                ) : (
                  "—"
                )
              }
            />
          </div>
          {event.description && (
            <p className="mt-4 text-sm text-text-1 whitespace-pre-wrap">
              {event.description}
            </p>
          )}
        </Card>

        <Card padding="none">
          <div className="p-5 border-b border-border">
            <CardHeader
              title="Schedule conflicts"
              subtitle="Checked against every club's calendar at submission"
            />
          </div>
          {event.conflicts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-text-3 text-center">
              No conflicts detected. Clear to schedule.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {event.conflicts.map((c) => {
                const other = c.conflictWithEventId
                  ? conflictEvents.get(c.conflictWithEventId)
                  : undefined
                return (
                  <li key={c.id} className="flex items-start gap-3 px-5 py-3.5">
                    <SeverityBadge severity={c.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-1">{c.reason}</p>
                      {other && (
                        <Link
                          href={`/calendar/${other.id}`}
                          className="text-xs text-[--primary] hover:underline"
                        >
                          View “{other.title}”
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
