import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, MapPin, AlertTriangle } from "lucide-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { Card } from "@/components/ui/Card"
import { EventBadge } from "@/components/ui/Badge"

export const dynamic = "force-dynamic"

export default async function CalendarPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const ctx = await getUserContext(session.user.id)
  const oseInstitutionIds = ctx.institutionRoles.map((m) => m.institutionId)
  const memberOrgIds = ctx.orgRoles
    .filter((r) => r.status === "SHADOW" || r.status === "ACTIVE")
    .map((r) => r.organizationId)

  // Members' own institutions (for seeing other clubs' published events)
  const memberInstitutions = memberOrgIds.length
    ? (
        await db.organization.findMany({
          where: { id: { in: memberOrgIds } },
          select: { institutionId: true },
        })
      ).map((o) => o.institutionId)
    : []

  const events = await db.event.findMany({
    where: {
      status: { not: "CANCELLED" },
      startAt: { gte: new Date(Date.now() - 864e5) }, // from yesterday onward
      OR: [
        // OSE: everything at the institution
        { institutionId: { in: oseInstitutionIds } },
        // Members: their clubs' events in any state
        { organizationId: { in: memberOrgIds } },
        // Everyone: published events across their institution
        { institutionId: { in: memberInstitutions }, status: "PUBLISHED" },
      ],
    },
    orderBy: { startAt: "asc" },
    take: 60,
    include: {
      organization: { select: { name: true } },
      conflicts: { where: { severity: "HARD", resolved: false }, select: { id: true } },
    },
  })

  const canCreate = ctx.orgRoles.some((r) => r.status === "ACTIVE")

  // Group by calendar day
  const byDay = new Map<string, typeof events>()
  for (const e of events) {
    const key = e.startAt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    byDay.set(key, [...(byDay.get(key) ?? []), e])
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-1">Calendar</h1>
          <p className="text-sm text-text-2 mt-1">
            Shared schedule across clubs — conflicts are flagged before approval.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/calendar/new"
            className="inline-flex items-center gap-1.5 h-9 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:opacity-90 no-underline shrink-0"
          >
            <Plus size={15} /> Propose event
          </Link>
        )}
      </div>

      {events.length === 0 ? (
        <Card>
          <p className="text-sm text-text-2 py-4 text-center">
            No upcoming events. {canCreate ? "Propose the first one." : ""}
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {[...byDay.entries()].map(([day, dayEvents]) => (
            <div key={day}>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-3 mb-2">
                {day}
              </p>
              <Card padding="none">
                <ul className="divide-y divide-border">
                  {dayEvents.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/calendar/${e.id}`}
                        className="flex items-center gap-4 px-5 py-3.5 hover:bg-base transition-colors no-underline"
                      >
                        <div className="text-center shrink-0 w-16">
                          <p className="text-sm font-semibold text-text-1">
                            {e.startAt.toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-1 truncate">
                            {e.title}
                          </p>
                          <p className="text-xs text-text-3 mt-0.5 flex items-center gap-2">
                            <span>{e.organization.name}</span>
                            {e.venue && (
                              <span className="inline-flex items-center gap-0.5">
                                <MapPin size={11} /> {e.venue}
                              </span>
                            )}
                          </p>
                        </div>
                        {e.conflicts.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-medium"
                            style={{ color: "var(--error)" }}
                          >
                            <AlertTriangle size={13} /> {e.conflicts.length}
                          </span>
                        )}
                        <EventBadge status={e.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
