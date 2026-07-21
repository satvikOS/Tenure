"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, CalendarDays, MapPin, X } from "@/components/ui/icons"

export interface GridEvent {
  id: string
  title: string
  day: number // day-of-month (UTC)
  time: string
  org: string
  venue: string | null
  status: string
  hardConflicts: number
  /**
   * Club events open their detail page; OSE deliverables have no detail
   * route, so they render inert rather than as links that 404.
   */
  kind?: "event" | "deliverable"
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/**
 * Interactive month grid: click a day to inspect its events in the side
 * panel; chips deep-link to event pages.
 */
export function CalendarGrid({
  events,
  firstWeekday,
  daysInMonth,
  todayDay,
  monthLabel,
}: {
  events: GridEvent[]
  firstWeekday: number
  daysInMonth: number
  todayDay: number | null
  monthLabel: string
}) {
  const [selected, setSelected] = useState<number | null>(null)

  const byDay = new Map<number, GridEvent[]>()
  for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e])

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const dayEvents = selected ? (byDay.get(selected) ?? []) : []

  return (
    <div className="flex flex-col xl:flex-row gap-4">
      <div className="flex-1 rounded-lg border border-border bg-surface overflow-hidden">
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
          {cells.map((day, i) => {
            const evts = day ? (byDay.get(day) ?? []) : []
            const isSelected = day !== null && day === selected
            return (
              <div
                key={i}
                role={day ? "button" : undefined}
                tabIndex={day ? 0 : undefined}
                aria-label={day ? `Day ${day}, ${evts.length} events` : undefined}
                onClick={() => day && setSelected(isSelected ? null : day)}
                onKeyDown={(e) => {
                  if (day && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault()
                    setSelected(isSelected ? null : day)
                  }
                }}
                className={`min-h-24 border-b border-r border-border p-1.5 transition-colors outline-none ${
                  (i + 1) % 7 === 0 ? "border-r-0" : ""
                } ${i >= cells.length - 7 ? "border-b-0" : ""} ${
                  day === null
                    ? "bg-base/50"
                    : isSelected
                      ? "bg-[--primary-light] cursor-pointer"
                      : "cursor-pointer hover:bg-base focus-visible:ring-2 focus-visible:ring-[--primary]"
                }`}
              >
                {day !== null && (
                  <>
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        day === todayDay
                          ? "bg-[--primary] text-white font-semibold"
                          : "text-text-2"
                      }`}
                    >
                      {day}
                    </span>
                    <div className="mt-1 space-y-1">
                      {evts.slice(0, 3).map((e) => (
                        <div
                          key={e.id}
                          title={`${e.title} — ${e.org}`}
                          className={`truncate rounded px-1.5 py-0.5 text-xs ${
                            e.status === "PUBLISHED"
                              ? "bg-[--primary-light] text-[--primary]"
                              : "bg-[--warning-light] text-[--warning]"
                          }`}
                        >
                          {e.hardConflicts > 0 && (
                            <AlertTriangle size={10} className="inline mr-0.5 -mt-0.5" />
                          )}
                          {e.time} {e.title}
                        </div>
                      ))}
                      {evts.length > 3 && (
                        <p className="px-1.5 text-xs text-text-3">+{evts.length - 3} more</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Day inspector */}
      <aside className="xl:w-80 shrink-0">
        <div className="rounded-lg border border-border bg-surface p-4 sticky top-16">
          {selected === null ? (
            <div className="py-8 text-center">
              <CalendarDays size={22} className="mx-auto text-text-3" />
              <p className="text-sm text-text-2 mt-3">
                Click a day to see its schedule.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-text-1">
                  {monthLabel.split(" ")[0]} {selected}
                </h2>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close day panel"
                  className="text-text-3 hover:text-text-1"
                >
                  <X size={15} />
                </button>
              </div>
              {dayEvents.length === 0 ? (
                <p className="text-sm text-text-3 py-4 text-center">
                  Nothing scheduled — a free day.
                </p>
              ) : (
                <ul className="space-y-2">
                  {dayEvents.map((e) => {
                    const body = (
                      <>
                        <p className="text-sm font-medium text-text-1">{e.title}</p>
                        <p className="text-xs text-text-3 mt-0.5 flex items-center gap-2">
                          <span>{e.time}</span>
                          <span>{e.org}</span>
                          {e.venue && (
                            <span className="inline-flex items-center gap-0.5">
                              <MapPin size={10} /> {e.venue}
                            </span>
                          )}
                        </p>
                        {e.hardConflicts > 0 && (
                          <p
                            className="text-xs mt-1 inline-flex items-center gap-1"
                            style={{ color: "var(--error)" }}
                          >
                            <AlertTriangle size={11} /> {e.hardConflicts} hard conflict
                            {e.hardConflicts === 1 ? "" : "s"}
                          </p>
                        )}
                      </>
                    )

                    return (
                      <li key={e.id}>
                        {e.kind === "deliverable" ? (
                          <div className="block rounded border border-dashed border-border px-3 py-2">
                            {body}
                          </div>
                        ) : (
                          <Link
                            href={`/calendar/${e.id}`}
                            className="block rounded border border-border px-3 py-2 hover:border-[--primary] transition-colors no-underline"
                          >
                            {body}
                          </Link>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  )
}
