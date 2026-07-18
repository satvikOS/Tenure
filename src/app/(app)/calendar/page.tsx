import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, ChevronLeft, ChevronRight } from "lucide-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { CalendarGrid, type GridEvent } from "@/components/CalendarGrid"

export const dynamic = "force-dynamic"

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

  // OSE deliverables for this month — institution-wide deadlines that apply
  // to every board, shown alongside club events.
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
    org: e.organization.name,
    venue: e.venue,
    status: e.status,
    hardConflicts: e.conflicts.length,
    kind: "event" as const,
  }))

  const allGridEntries: GridEvent[] = [...gridEvents, ...deliverableEvents]

  const firstWeekday = monthStart.getUTCDay()
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const today = new Date()
  const todayDay =
    today.getUTCFullYear() === y && today.getUTCMonth() + 1 === mo
      ? today.getUTCDate()
      : null

  const canCreate = ctx.orgRoles.some((r) => r.status === "ACTIVE")

  return (
    <div className="w-full">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-text-1">Calendar</h1>
          <p className="text-sm text-text-2 mt-1">
            Shared schedule across clubs — click any day to inspect it.
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

      <CalendarGrid
        events={allGridEntries}
        firstWeekday={firstWeekday}
        daysInMonth={daysInMonth}
        todayDay={todayDay}
        monthLabel={monthLabel}
      />

      <p className="mt-3 text-xs text-text-3">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[--primary-light] align-middle mr-1" />
        Published
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[--warning-light] align-middle ml-4 mr-1" />
        Pending approval
      </p>
    </div>
  )
}
