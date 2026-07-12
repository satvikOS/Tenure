import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { Card } from "@/components/ui/Card"

export const dynamic = "force-dynamic"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function monthParam(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const { m } = await searchParams
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const now = new Date()
  const [y, mo] = /^\d{4}-\d{2}$/.test(m ?? "")
    ? m!.split("-").map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1]
  const monthStart = new Date(Date.UTC(y, mo - 1, 1))
  const monthEnd = new Date(Date.UTC(y, mo, 1))
  const prev = monthParam(new Date(Date.UTC(y, mo - 2, 1)))
  const next = monthParam(new Date(Date.UTC(y, mo, 1)))
  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  const ctx = await getUserContext(session.user.id)
  const oseInstitutionIds = ctx.institutionRoles.map((x) => x.institutionId)
  const memberOrgIds = ctx.orgRoles
    .filter((r) => r.status === "SHADOW" || r.status === "ACTIVE")
    .map((r) => r.organizationId)
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
      startAt: { gte: monthStart, lt: monthEnd },
      OR: [
        { institutionId: { in: oseInstitutionIds } },
        { organizationId: { in: memberOrgIds } },
        { institutionId: { in: memberInstitutions }, status: "PUBLISHED" },
      ],
    },
    orderBy: { startAt: "asc" },
    include: {
      organization: { select: { name: true } },
      conflicts: { where: { severity: "HARD", resolved: false }, select: { id: true } },
    },
  })

  // Bucket events by day-of-month
  const byDay = new Map<number, typeof events>()
  for (const e of events) {
    const day = e.startAt.getUTCDate()
    byDay.set(day, [...(byDay.get(day) ?? []), e])
  }

  const firstWeekday = monthStart.getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()
  const isToday = (d: number) =>
    today.getUTCFullYear() === y && today.getUTCMonth() + 1 === mo && today.getUTCDate() === d

  const canCreate = ctx.orgRoles.some((r) => r.status === "ACTIVE")

  return (
    <div className="max-w-screen-2xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-1">Calendar</h1>
          <p className="text-sm text-text-2 mt-1">
            Shared schedule across clubs — proposals are conflict-checked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/calendar?m=${prev}`}
            aria-label="Previous month"
            className="h-9 w-9 flex items-center justify-center rounded border border-border text-text-2 hover:bg-surface no-underline"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="text-sm font-semibold text-text-1 min-w-36 text-center">
            {monthLabel}
          </span>
          <Link
            href={`/calendar?m=${next}`}
            aria-label="Next month"
            className="h-9 w-9 flex items-center justify-center rounded border border-border text-text-2 hover:bg-surface no-underline"
          >
            <ChevronRight size={16} />
          </Link>
          <Link
            href="/calendar"
            className="h-9 px-3 flex items-center rounded border border-border text-sm text-text-2 hover:bg-surface no-underline"
          >
            Today
          </Link>
          {canCreate && (
            <Link
              href="/calendar/new"
              className="inline-flex items-center gap-1.5 h-9 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:opacity-90 no-underline"
            >
              <Plus size={15} /> Propose event
            </Link>
          )}
        </div>
      </div>

      <Card padding="none">
        <div className="grid grid-cols-7 border-b border-border">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-text-3 text-center"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => (
            <div
              key={i}
              className={`min-h-24 border-b border-r border-border p-1.5 ${
                (i + 1) % 7 === 0 ? "border-r-0" : ""
              } ${i >= cells.length - 7 ? "border-b-0" : ""} ${day === null ? "bg-base/50" : ""}`}
            >
              {day !== null && (
                <>
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                      isToday(day)
                        ? "bg-[--primary] text-white font-semibold"
                        : "text-text-2"
                    }`}
                  >
                    {day}
                  </span>
                  <div className="mt-1 space-y-1">
                    {(byDay.get(day) ?? []).slice(0, 3).map((e) => (
                      <Link
                        key={e.id}
                        href={`/calendar/${e.id}`}
                        title={`${e.title} — ${e.organization.name}`}
                        className={`block truncate rounded px-1.5 py-0.5 text-xs no-underline ${
                          e.status === "PUBLISHED"
                            ? "bg-[--primary-light] text-[--primary]"
                            : "bg-[--warning-light] text-[--warning]"
                        }`}
                      >
                        {e.conflicts.length > 0 && (
                          <AlertTriangle size={10} className="inline mr-0.5 -mt-0.5" />
                        )}
                        {e.startAt.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          timeZone: "UTC",
                        }).replace(" ", "").toLowerCase()}{" "}
                        {e.title}
                      </Link>
                    ))}
                    {(byDay.get(day)?.length ?? 0) > 3 && (
                      <p className="px-1.5 text-xs text-text-3">
                        +{byDay.get(day)!.length - 3} more
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>

      <p className="mt-3 text-xs text-text-3">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[--primary-light] align-middle mr-1" />
        Published
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[--warning-light] align-middle ml-4 mr-1" />
        Pending approval
      </p>
    </div>
  )
}
