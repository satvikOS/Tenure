"use client"

import { useState } from "react"
import { formatCents, formatCentsCompact } from "@/lib/finance"

export type ChartRow = {
  category: string
  budgetedCents: number
  projectedCents: number
}

/**
 * Horizontal grouped bar chart, actual/projected vs budget per category.
 *
 * Built in SVG rather than pulling in a charting library: the interaction we
 * need (live re-render as the forecast is edited, over/under colouring) is
 * simple, and a self-contained component keeps the bundle small and the CSP
 * story trivial. Horizontal bars handle long category names and any number of
 * rows better than vertical columns.
 */
export function BudgetBarChart({ rows }: { rows: ChartRow[] }) {
  const [hover, setHover] = useState<number | null>(null)

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-3">
        Add a budget line to see the chart.
      </p>
    )
  }

  const max = Math.max(
    1,
    ...rows.map((r) => Math.max(r.budgetedCents, r.projectedCents))
  )

  const rowH = 46
  const barH = 15
  const gap = 4
  const labelW = 150
  const valueW = 96
  const chartW = 640 // viewBox units; scales to container width
  const plotW = chartW - labelW - valueW
  const height = rows.length * rowH + 28

  const x = (cents: number) => (Math.max(0, cents) / max) * plotW

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${chartW} ${height}`}
        className="w-full"
        style={{ minWidth: 520 }}
        role="img"
        aria-label="Budget versus actual spending by category"
      >
        {/* gridlines at 0/25/50/75/100% of max */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const gx = labelW + f * plotW
          return (
            <g key={f}>
              <line
                x1={gx}
                y1={16}
                x2={gx}
                y2={height - 12}
                stroke="var(--border)"
                strokeWidth={0.5}
              />
              <text x={gx} y={10} fontSize={9} fill="var(--text-3)" textAnchor="middle">
                {formatCentsCompact(Math.round(max * f))}
              </text>
            </g>
          )
        })}

        {rows.map((row, i) => {
          const y = 20 + i * rowH
          const over = row.projectedCents > row.budgetedCents
          const isHover = hover === i
          return (
            <g
              key={row.category}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {isHover && (
                <rect
                  x={0}
                  y={y - 6}
                  width={chartW}
                  height={rowH - 2}
                  fill="var(--bg-base)"
                  rx={4}
                />
              )}

              <text
                x={labelW - 10}
                y={y + barH + gap}
                fontSize={11}
                fill="var(--text-1)"
                textAnchor="end"
              >
                {row.category.length > 22 ? row.category.slice(0, 21) + "…" : row.category}
              </text>

              {/* Budget bar (muted) */}
              <rect
                x={labelW}
                y={y}
                width={x(row.budgetedCents)}
                height={barH}
                rx={2}
                fill="var(--border-strong)"
                opacity={0.55}
              />
              {/* Actual / projected bar (green under, red over) */}
              <rect
                x={labelW}
                y={y + barH + gap}
                width={x(row.projectedCents)}
                height={barH}
                rx={2}
                fill={over ? "var(--error)" : "var(--primary)"}
              />

              <text
                x={chartW - valueW + 8}
                y={y + barH + gap}
                fontSize={10}
                fill="var(--text-2)"
                dominantBaseline="middle"
              >
                {formatCentsCompact(row.projectedCents)} / {formatCentsCompact(row.budgetedCents)}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="mt-1 flex items-center gap-4 pl-2 text-xs text-text-3">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-3 rounded-sm"
            style={{ background: "var(--border-strong)", opacity: 0.55 }}
          />
          Budget
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: "var(--primary)" }} />
          Actual / projected (under)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: "var(--error)" }} />
          Over budget
        </span>
      </div>

      {hover !== null && (
        <p className="mt-2 pl-2 text-xs text-text-2">
          <span className="font-medium text-text-1">{rows[hover].category}</span>:{" "}
          {formatCents(rows[hover].projectedCents)} of {formatCents(rows[hover].budgetedCents)}{" "}
          budgeted ·{" "}
          <span
            className={
              rows[hover].projectedCents > rows[hover].budgetedCents
                ? "text-[--error]"
                : "text-[--primary]"
            }
          >
            {formatCents(Math.abs(rows[hover].budgetedCents - rows[hover].projectedCents))}{" "}
            {rows[hover].projectedCents > rows[hover].budgetedCents ? "over" : "under"}
          </span>
        </p>
      )}
    </div>
  )
}
