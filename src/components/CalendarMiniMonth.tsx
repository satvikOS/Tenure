import Link from "next/link"
import { ChevronLeft, ChevronRight } from "@/components/ui/icons"

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Outlook-style mini-month navigator for the Week/Day calendar rail. Renders the
 * month containing the selected day; every date is a link that jumps the main
 * view to that day, the displayed range (current week or day) is highlighted as
 * a continuous pill, today is a filled dot, and the month arrows page the
 * navigator (and the main view) a month at a time.
 */
export function CalendarMiniMonth({
  baseISO,
  view,
  rangeStartISO,
  rangeEndISO,
}: {
  baseISO: string
  view: "week" | "day"
  rangeStartISO: string
  rangeEndISO: string
}) {
  const base = new Date(`${baseISO}T00:00:00.000Z`)
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth()
  const monthLabel = base.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
  const firstOfMonth = new Date(Date.UTC(y, m, 1))
  const gridStart = new Date(firstOfMonth.getTime() - firstOfMonth.getUTCDay() * DAY) // back to Sunday
  const todayISO = iso(new Date())

  // Same day-of-month one month either side (clamped so the 31st doesn't skip).
  const prevMonthDay = iso(new Date(Date.UTC(y, m - 1, Math.min(base.getUTCDate(), 28))))
  const nextMonthDay = iso(new Date(Date.UTC(y, m + 1, Math.min(base.getUTCDate(), 28))))

  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * DAY))

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-text-1">{monthLabel}</span>
        <div className="flex items-center gap-0.5">
          <Link
            href={`/calendar?view=${view}&d=${prevMonthDay}`}
            aria-label="Previous month"
            className="grid h-6 w-6 place-items-center rounded text-text-3 no-underline hover:bg-base"
          >
            <ChevronLeft size={15} />
          </Link>
          <Link
            href={`/calendar?view=${view}&d=${nextMonthDay}`}
            aria-label="Next month"
            className="grid h-6 w-6 place-items-center rounded text-text-3 no-underline hover:bg-base"
          >
            <ChevronRight size={15} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="py-1 text-[10px] font-medium text-text-3">
            {d}
          </span>
        ))}
        {cells.map((d) => {
          const dISO = iso(d)
          const isToday = dISO === todayISO
          const inMonth = d.getUTCMonth() === m
          const inRange = dISO >= rangeStartISO && dISO <= rangeEndISO
          const isRangeStart = dISO === rangeStartISO
          const isRangeEnd = dISO === rangeEndISO
          return (
            <Link
              key={dISO}
              href={`/calendar?view=${view}&d=${dISO}`}
              aria-label={d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
              className={`grid h-7 place-items-center text-[11px] tabular-nums no-underline transition-colors ${
                inRange
                  ? `bg-[--primary-light] ${isRangeStart ? "rounded-l-md" : ""} ${isRangeEnd ? "rounded-r-md" : ""}`
                  : "rounded-md hover:bg-base"
              } ${inMonth ? "text-text-1" : "text-text-3"}`}
            >
              <span
                className={
                  isToday
                    ? "grid h-5 w-5 place-items-center rounded-full bg-[--primary] font-semibold text-white"
                    : ""
                }
              >
                {d.getUTCDate()}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
