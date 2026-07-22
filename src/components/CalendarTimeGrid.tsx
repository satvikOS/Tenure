"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { clubSwatch } from "@/lib/calendar-color"

export interface TimeGridEvent {
  id: string
  title: string
  startISO: string
  endISO: string
  org: string
  venue: string | null
  status: string
}

export interface TimeGridDay {
  /** YYYY-MM-DD (UTC) */
  date: string
  weekday: string
  dayNum: number
  isToday: boolean
}

const START_HOUR = 7
const END_HOUR = 23
const HOUR_PX = 52
const GUTTER_PX = 56

/** Minutes from START_HOUR, using the event's UTC wall-clock time. */
function minutesFromStart(iso: string): number {
  const d = new Date(iso)
  return (d.getUTCHours() - START_HOUR) * 60 + d.getUTCMinutes()
}

/**
 * An Outlook-style hourly time grid for the Week and Day calendar views.
 * Events are positioned by their start/end time; concurrent events split the
 * column so nothing is hidden. Colours are muted and per-club, so a busy day
 * still reads cleanly. Renders the shared, internal cross-club calendar.
 */
export function CalendarTimeGrid({ days, events }: { days: TimeGridDay[]; events: TimeGridEvent[] }) {
  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i),
    []
  )
  const gridHeight = (END_HOUR - START_HOUR) * HOUR_PX

  // Current-time indicator — positioned by UTC wall-clock so it lines up with
  // how events are placed. Ticks every minute; shown only when today is in view
  // and "now" falls inside the visible hour band.
  const hasToday = days.some((d) => d.isToday)
  const [nowMin, setNowMin] = useState<number | null>(null)
  useEffect(() => {
    const compute = () => {
      const d = new Date()
      setNowMin((d.getUTCHours() - START_HOUR) * 60 + d.getUTCMinutes())
    }
    compute()
    const id = setInterval(compute, 60_000)
    return () => clearInterval(id)
  }, [])
  const nowY = nowMin == null ? null : (nowMin / 60) * HOUR_PX
  const showNow = hasToday && nowY != null && nowY >= 0 && nowY <= gridHeight

  // Lay out each day's events into non-overlapping columns.
  const layoutByDay = useMemo(() => {
    const map = new Map<string, { e: TimeGridEvent; top: number; height: number; col: number; cols: number }[]>()
    for (const day of days) {
      const dayEvents = events
        .filter((e) => e.startISO.slice(0, 10) === day.date)
        .sort((a, b) => a.startISO.localeCompare(b.startISO))

      const columnsEnd: number[] = [] // end-minute of the last event in each column
      const placed = dayEvents.map((e) => {
        const start = Math.max(0, minutesFromStart(e.startISO))
        const end = Math.max(start + 30, minutesFromStart(e.endISO))
        let col = columnsEnd.findIndex((endMin) => endMin <= start)
        if (col === -1) {
          col = columnsEnd.length
          columnsEnd.push(end)
        } else {
          columnsEnd[col] = end
        }
        return { e, startMin: start, endMin: end, col }
      })
      const cols = Math.max(1, columnsEnd.length)
      map.set(
        day.date,
        placed.map((p) => ({
          e: p.e,
          top: (p.startMin / 60) * HOUR_PX,
          height: Math.max(22, ((p.endMin - p.startMin) / 60) * HOUR_PX - 2),
          col: p.col,
          cols,
        }))
      )
    }
    return map
  }, [days, events])

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {/* Day headers */}
      <div className="flex border-b border-border" style={{ paddingLeft: 56 }}>
        {days.map((d) => (
          <div key={d.date} className="flex-1 border-l border-border px-2 py-2 text-center first:border-l-0">
            <span className="text-meta uppercase tracking-wide text-text-3">{d.weekday}</span>
            <span
              className={`mx-auto mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm font-semibold ${
                d.isToday ? "bg-[--primary] text-white" : "text-text-1"
              }`}
            >
              {d.dayNum}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable time grid */}
      <div className="max-h-[62vh] overflow-y-auto">
        <div className="relative flex" style={{ height: gridHeight }}>
          {/* Hour gutter */}
          <div className="w-14 shrink-0">
            {hours.slice(0, -1).map((h) => (
              <div key={h} className="relative border-b border-border" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-2 text-[11px] tabular-nums text-text-3">
                  {h % 12 === 0 ? 12 : h % 12}
                  {h < 12 ? "am" : "pm"}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const placed = layoutByDay.get(d.date) ?? []
            return (
              <div key={d.date} className="relative flex-1 border-l border-border">
                {hours.slice(0, -1).map((h) => (
                  <div key={h} className="border-b border-border" style={{ height: HOUR_PX }} />
                ))}
                {placed.map(({ e, top, height, col, cols }) => {
                  const sw = clubSwatch(e.org)
                  const widthPct = 100 / cols
                  return (
                    <Link
                      key={e.id}
                      href={`/calendar/${e.id}`}
                      className="absolute overflow-hidden rounded-md border-l-2 px-2 py-1 text-[12px] leading-tight no-underline shadow-xs"
                      style={{
                        top,
                        height,
                        left: `calc(${col * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        background: sw.bg,
                        borderColor: sw.border,
                        color: sw.text,
                      }}
                    >
                      <span className="block truncate font-semibold">{e.title}</span>
                      <span className="block truncate opacity-80">
                        {new Date(e.startISO).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: "UTC",
                        })}
                        {e.venue ? ` · ${e.venue}` : ""}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )
          })}

          {/* Current-time line — dot in the gutter, hairline across the days. */}
          {showNow && (
            <div
              className="pointer-events-none absolute z-20"
              style={{ top: nowY!, left: GUTTER_PX, right: 0 }}
            >
              <span
                className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                style={{ background: "var(--primary)" }}
              />
              <div className="h-0.5 w-full" style={{ background: "var(--primary)" }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
