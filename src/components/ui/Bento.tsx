import { type ReactNode } from "react"
import Link from "next/link"
import { type IconType } from "@/components/ui/icons"

/**
 * The Bento system — one uniform tile grammar for the whole product.
 *
 * Every dashboard, worklet board and admin overview lays out on the same
 * 12-column grid with the same gaps, and every tile is the same surface,
 * radius, border and elevation. Vary a tile's width with `span`; never its
 * shape. This is what makes the product read as one system instead of a dozen
 * bespoke cards.
 */

const SPAN: Record<number, string> = {
  3: "col-span-12 sm:col-span-6 lg:col-span-3",
  4: "col-span-12 sm:col-span-6 lg:col-span-4",
  5: "col-span-12 lg:col-span-5",
  6: "col-span-12 lg:col-span-6",
  7: "col-span-12 lg:col-span-7",
  8: "col-span-12 lg:col-span-8",
  9: "col-span-12 lg:col-span-9",
  12: "col-span-12",
}

export function BentoGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`grid grid-cols-12 gap-4 sm:gap-5 ${className ?? ""}`}>
      {children}
    </div>
  )
}

export function BentoTile({
  children,
  span = 4,
  className,
  padding = true,
  tone = "surface",
}: {
  children: ReactNode
  span?: keyof typeof SPAN | number
  className?: string
  padding?: boolean
  tone?: "surface" | "accent" | "subtle"
}) {
  const toneClass =
    tone === "accent"
      ? "bg-accent-light border-transparent"
      : tone === "subtle"
        ? "bg-subtle border-border"
        : "bg-surface border-border"
  return (
    <div
      className={`
        ${SPAN[span] ?? SPAN[4]}
        tile-float rounded-lg border ${toneClass}
        ${padding ? "p-5 sm:p-6" : ""}
        ${className ?? ""}
      `}
    >
      {children}
    </div>
  )
}

/** A uniform KPI row — the four-across summary stat pattern. */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">{children}</div>
  )
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  color = "var(--primary)",
  bg = "var(--primary-light)",
  href,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon: IconType
  color?: string
  bg?: string
  href?: string
}) {
  const inner = (
    <div className="tile-float flex h-full flex-col rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg"
        style={{ background: bg }}
      >
        <Icon size={22} style={{ color }} weight="duotone" />
      </div>
      <p
        className="mt-4 text-3xl font-bold tabular-nums"
        style={{ color: "var(--text-1)", letterSpacing: "-0.02em" }}
      >
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-text-1">{label}</p>
      {hint && <p className="mt-0.5 text-meta text-text-3">{hint}</p>}
    </div>
  )
  if (href) {
    return (
      <Link href={href} className="block no-underline outline-none focus-visible:ring-2 focus-visible:ring-[--primary] rounded-lg">
        {inner}
      </Link>
    )
  }
  return inner
}
