import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, ChevronLeft, ChevronRight, CalendarDays, MapPin } from "@/components/ui/icons"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { loadScopedEvents } from "@/lib/calendar-data"
import { calendarToken } from "@/lib/calendar-sync"
import { CalendarGrid, type GridEvent } from "@/components/CalendarGrid"
import { CalendarSubscribe } from "@/components/CalendarSubscribe"
import { Card } from "@/components/ui/Card"
import { EmptyState } from "@/components/ui/EmptyState"
import { EventBadge } from "@/components/ui/Badge"
import type { EventStatus } from "@prisma/client"

export const dynamic = "force-dynamic"

function monthParam(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

const DAY = 86_400_000

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; view?: string }>
}) {
  const { m, view } = await searchParams
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")
  const userId = session.user.id

  const isAgenda = view === "agenda"
  const ctx = await getUserContext(userId)
  const canCreate = ctx.orgRoles.some((r) => r.status === "ACTIVE")
  const feedPath = `/api/calendar/ics/${calendarToken(userId)}`

  const header = (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-text-1">Calendar</h1>
        <p className="mt-1 text-lead text-text-2">
          Shared schedule across clubs — subscribe to keep Outlook in sync.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          <Link
            href="/calendar"
            className={`rounded px-3 py-1.5 text-[13px] font-medium no-underline ${
              !isAgenda ? "bg-[--primary] text-white" : "text-text-2 hover:text-text-1"
            }`}
          >
            Month
          </Link>
          <Link
            href="/calendar?view=agenda"
            className={`rounded px-3 py-1.5 text-[13px] font-medium no-underline ${
              isAgenda ? "bg-[--primary] text-white" : "text-text-2 hover:text-text-1"
            }`}
          >
            Agenda
          </Link>
        </div>
        <CalendarSubscribe feedPath={feedPath} />
        {canCreate && (
          <Link
            href="/calendar/new"
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[--primary] px-4 text-sm font-medium text-white no-underline hover:bg-[--primary-hover]"
          >
            <Plus size={16} /> Propose event
          </Link>
        )}
      </div>
    </div>
  )

  // ── Agenda view — upcoming events as a grouped list ──────────────────────────
  if (isAgenda) {
    const now = new Date()
    const events = await loadScopedEvents(userId, now, new Date(now.getTime() + 90 * DAY))
    const byDay = new Map<string, typeof events>()
    for (const e of events) {
      const key = e.startAt.toISOString().slice(0, 10)
      byDay.set(key, [...(byDay.get(key) ?? []), e])
    }

    return (
      <div className="w-full">
        {header}
        {events.length === 0 ? (
          <Card>
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled"
              description="Upcoming events across your clubs will appear here."
            />
          </Card>
        ) : (
          <div className="space-y-6">
            {[...byDay.entries()].map(([day, dayEvents]) => (
              <section key={day}>
                <h2 className="mb-3 text-meta font-semibold uppercase tracking-wide text-text-3">
                  {new Date(day + "T00:00:00Z").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </h2>
                <div className="space-y-2">
                  {dayEvents.map((e) => (
                    <Link
                      key={e.id}
                      href={`/calendar/${e.id}`}
                      className="tile-float flex items-center gap-4 rounded-lg border border-border bg-surface p-4 no-underline"
                    >
                      <div className="w-20 shrink-0 text-sm font-semibold tabular-nums text-text-1">
                        {e.startAt.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: "UTC",
                        })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-text-1">{e.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-text-3">
                          <span>{e.organizationName}</span>
                          {e.venue && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={13} /> {e.venue}
                            </span>
                          )}
                        </p>
                      </div>
                      <EventBadge status={e.status as EventStatus} />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Month view — the interactive grid ────────────────────────────────────────
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

  const events = await loadScopedEvents(userId, monthStart, monthEnd)

  const deliverables = await db.deliverable.findMany({
    where: { dueAt: { gte: monthStart, lt: monthEnd } },
    orderBy: { dueAt: "asc" },
  })

  const TERM_LABELS: Record<string, string> = {
    FALL_A: "Fall A",
    FALL_B: "Fall B",
    SPRING_A: "Spring A",
    SPRING_B: "Spring B",
  }

  const deliverableEvents: GridEvent[] = deliverables.map((d) => ({
    id: `deliverable-${d.id}`,
    title: d.title,
    day: d.dueAt.getUTCDate(),
    time: d.kind === "DEADLINE" ? "Due" : d.kind.toLowerCase(),
    org: d.term ? `Ainslie OSE · ${TERM_LABELS[d.term] ?? d.term}` : "Ainslie OSE",
    venue: null,
    status: d.kind,
    hardConflicts: 0,
    kind: "deliverable",
  }))

  const gridEvents: GridEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    day: e.startAt.getUTCDate(),
    time: e.startAt
      .toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" })
      .replace(" ", "")
      .toLowerCase(),
    org: e.organizationName,
    venue: e.venue,
    status: e.status,
    hardConflicts: e.hardConflicts,
    kind: "event" as const,
  }))

  const allGridEntries: GridEvent[] = [...gridEvents, ...deliverableEvents]
  const firstWeekday = monthStart.getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const todayDay =
    now.getUTCFullYear() === y && now.getUTCMonth() + 1 === mo ? now.getUTCDate() : null

  return (
    <div className="w-full">
      {header}

      <div className="mb-4 flex items-center gap-2">
        <Link
          href={`/calendar?m=${prev}`}
          aria-label="Previous month"
          className="grid h-9 w-9 place-items-center rounded-md border border-border text-text-2 no-underline hover:bg-surface"
        >
          <ChevronLeft size={16} />
        </Link>
        <span className="min-w-36 text-center text-sm font-semibold text-text-1">{monthLabel}</span>
        <Link
          href={`/calendar?m=${next}`}
          aria-label="Next month"
          className="grid h-9 w-9 place-items-center rounded-md border border-border text-text-2 no-underline hover:bg-surface"
        >
          <ChevronRight size={16} />
        </Link>
        <Link
          href="/calendar"
          className="flex h-9 items-center rounded-md border border-border px-3 text-sm text-text-2 no-underline hover:bg-surface"
        >
          Today
        </Link>
      </div>

      <CalendarGrid
        events={allGridEntries}
        firstWeekday={firstWeekday}
        daysInMonth={daysInMonth}
        todayDay={todayDay}
        monthLabel={monthLabel}
      />

      <p className="mt-3 text-[13px] text-text-3">
        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[--primary-light] align-middle" />
        Published
        <span className="ml-4 mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[--warning-light] align-middle" />
        Pending approval
      </p>
    </div>
  )
}
