"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Search,
  ExternalLink,
  AlertCircle,
  BookOpen,
  PenSquare,
  ScrollText,
  SlidersHorizontal,
  ListTodo,
  ArrowRight,
  type IconType,
} from "@/components/ui/icons"
import { Badge } from "@/components/ui/Badge"
import { EmptyState } from "@/components/ui/EmptyState"
import {
  KIND_LABELS,
  RESOURCES,
  SEAT_LABELS,
  type Resource,
  type ResourceKind,
  type SeatKey,
} from "@/lib/resources"

const KIND_ICON: Record<ResourceKind, IconType> = {
  form: PenSquare,
  guide: BookOpen,
  policy: ScrollText,
  tool: SlidersHorizontal,
  checklist: ListTodo,
}

const SEAT_ORDER: SeatKey[] = ["ALL", "PRESIDENT", "VP_FINANCE", "VP_EVENTS", "VP_MARKETING", "MBA_REP", "OSE"]
const KINDS: ResourceKind[] = ["form", "guide", "policy", "tool", "checklist"]

function ResourceCard({ resource, mine }: { resource: Resource; mine: boolean }) {
  const Icon = KIND_ICON[resource.kind]
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[--primary-light] text-[--primary]">
          <Icon size={20} weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-[15px] font-semibold text-text-1">{resource.title}</h3>
            {resource.external ? (
              <ExternalLink size={15} className="mt-0.5 shrink-0 text-text-3" aria-hidden />
            ) : (
              <ArrowRight size={15} className="mt-0.5 shrink-0 text-text-3" aria-hidden />
            )}
          </div>
          <p className="mt-1 text-sm text-text-2">{resource.description}</p>
        </div>
      </div>
      {resource.rule && (
        <p className="mt-3 flex items-start gap-1.5 rounded-md bg-[--warning-light] px-2.5 py-2 text-[13px] text-text-1">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-[--warning]" aria-hidden />
          {resource.rule}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Badge variant="default">{KIND_LABELS[resource.kind]}</Badge>
        {mine && <Badge variant="success">Your seat</Badge>}
        {!resource.ready && <Badge variant="info">Being built</Badge>}
      </div>
    </>
  )

  const className = "tile-float block h-full rounded-lg border border-border bg-surface p-4 no-underline"
  if (!resource.ready) {
    return (
      <div className={`${className} cursor-default opacity-70`} aria-disabled="true">
        {inner}
      </div>
    )
  }
  if (resource.external) {
    return (
      <a href={resource.href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    )
  }
  // File downloads (API routes) need a plain anchor: the client router would
  // try to soft-navigate to the route instead of saving the attachment.
  if (resource.href.startsWith("/api/")) {
    return (
      <a href={resource.href} download className={className}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={resource.href} className={className}>
      {inner}
    </Link>
  )
}

/**
 * A searchable, filterable resource hub. Everything a board seat needs — forms,
 * guides, policies, tools — searchable by name, filterable by type, and grouped
 * by seat with the viewer's own sections pinned to the top.
 */
export function ResourcesBrowser({ mySeats, isOse }: { mySeats: SeatKey[]; isOse: boolean }) {
  const mine = useMemo(() => new Set(mySeats), [mySeats])
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState<ResourceKind | null>(null)
  const [mineOnly, setMineOnly] = useState(false)

  const q = query.trim().toLowerCase()

  const groups = useMemo(() => {
    return SEAT_ORDER.map((seat) => {
      const resources = RESOURCES.filter(
        (r) =>
          r.seats.includes(seat) &&
          (!kind || r.kind === kind) &&
          (!q || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
      )
      return { seat, resources, mine: mine.has(seat) }
    })
      .filter((g) => g.resources.length > 0)
      .filter((g) => (isOse || g.mine || g.seat !== "OSE"))
      .filter((g) => (!mineOnly || g.mine))
      .sort((a, b) => Number(b.mine) - Number(a.mine))
  }, [q, kind, mineOnly, mine, isOse])

  const total = groups.reduce((n, g) => n + g.resources.length, 0)

  return (
    <div>
      {/* Search + filters */}
      <div className="mb-6 space-y-3">
        <div className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 focus-within:border-[--border-focus]">
          <Search size={18} className="shrink-0 text-text-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search forms, guides and policies…"
            aria-label="Search resources"
            className="flex-1 bg-transparent text-[15px] text-text-1 outline-none placeholder:text-text-3"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={kind === null} onClick={() => setKind(null)}>
            All types
          </FilterChip>
          {KINDS.map((k) => (
            <FilterChip key={k} active={kind === k} onClick={() => setKind(kind === k ? null : k)}>
              {KIND_LABELS[k]}
            </FilterChip>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <FilterChip active={mineOnly} onClick={() => setMineOnly((v) => !v)}>
            My seats only
          </FilterChip>
        </div>
      </div>

      {total === 0 ? (
        <EmptyState icon={Search} title="No matching resources" description="Try a different search or clear the filters." />
      ) : (
        <div className="space-y-8">
          {groups.map(({ seat, resources, mine: isMine }) => (
            <section key={seat} aria-labelledby={`seat-${seat}`}>
              <div className="mb-3 flex items-center gap-2">
                <h2 id={`seat-${seat}`} className="text-meta font-semibold uppercase tracking-wide text-text-3">
                  {SEAT_LABELS[seat]}
                </h2>
                {isMine && seat !== "ALL" && <Badge variant="success">Your seat</Badge>}
                <span className="text-[13px] text-text-3">· {resources.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {resources.map((r) => (
                  <ResourceCard key={`${seat}-${r.id}`} resource={r} mine={isMine && seat !== "ALL"} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? "border-[--primary] bg-[--primary] text-white"
          : "border-border text-text-2 hover:border-[--border-strong] hover:text-text-1"
      }`}
    >
      {children}
    </button>
  )
}
