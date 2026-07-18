import Link from "next/link"
import { Users, Archive, ArchiveRestore } from "lucide-react"
import type { OrgStatus, OrgCategory } from "@prisma/client"
import { Badge } from "@/components/ui/Badge"
import { setClubStatus } from "@/app/(app)/orgs/actions"

const CATEGORY_LABEL: Record<OrgCategory, string> = {
  ORGANIZATION: "Organization",
  PROFESSIONAL: "Professional",
  COMMUNITY: "Community",
  SOCIAL: "Social",
}

const BANNER_HUES = [210, 262, 288, 152, 24, 340, 190, 128]
function hueFor(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return BANNER_HUES[h % BANNER_HUES.length]
}
function monogram(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export interface ClubCardStats {
  filledSeats: number
  boardSeats: number
  vacancies: number
  president?: string | null
}

/**
 * The single, uniform club card. Every card is the same height and structure:
 * an image (or generated monogram) banner, the category lozenge, name, a
 * two-line description, a seats summary, and a dedicated footer action row —
 * so the archive control lives beside the content instead of on top of it.
 */
export function ClubCard({
  org,
  stats,
  canArchive,
}: {
  org: {
    id: string
    slug: string
    name: string
    description?: string | null
    category: OrgCategory
    status: OrgStatus
    logoUrl?: string | null
  }
  stats: ClubCardStats
  canArchive: boolean
}) {
  const hue = hueFor(org.name)

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition hover:border-[--border-strong] hover:shadow-md">
      {/* Banner — uploaded/linked image or a deterministic monogram */}
      <div className="relative h-28 shrink-0 overflow-hidden">
        {org.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="grid h-full w-full place-items-center"
            style={{
              background: `linear-gradient(135deg, hsl(${hue} 62% 55%), hsl(${(hue + 40) % 360} 58% 42%))`,
            }}
          >
            <span className="font-display text-3xl font-bold text-white/95">{monogram(org.name)}</span>
          </div>
        )}
        <div className="absolute right-3 top-3 flex gap-1.5">
          {org.status !== "ACTIVE" && (
            <Badge variant={org.status === "ARCHIVED" ? "default" : "warning"}>
              {org.status.toLowerCase()}
            </Badge>
          )}
          <span className="rounded-md bg-black/45 px-2 py-1 text-[12px] font-semibold leading-none text-white backdrop-blur-sm">
            {CATEGORY_LABEL[org.category]}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-base font-semibold text-text-1">
          <Link
            href={`/orgs/${org.slug}/members`}
            className="text-text-1 no-underline outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-[--primary] focus-visible:underline"
          >
            {org.name}
          </Link>
        </h3>
        <p className="mt-1.5 line-clamp-2 min-h-[2.7em] text-sm text-text-2">
          {org.description || "No description yet."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-text-3">
          <span className="inline-flex items-center gap-1.5">
            <Users size={14} /> {stats.filledSeats}/{stats.boardSeats} seats filled
          </span>
          {stats.vacancies > 0 && <span className="text-[--warning]">{stats.vacancies} vacant</span>}
        </div>
        {stats.president && (
          <p className="mt-1 truncate text-[13px] text-text-3">President · {stats.president}</p>
        )}
      </div>

      {/* Footer action row — sits above the stretched link, so no overlap */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-t border-border px-5 py-3">
        <span className="text-[13px] font-medium text-text-link">View roster →</span>
        {canArchive && (
          <form action={setClubStatus}>
            <input type="hidden" name="organizationId" value={org.id} />
            <input type="hidden" name="status" value={org.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED"} />
            <button
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-text-3 outline-none transition-colors hover:bg-base hover:text-text-1 focus-visible:ring-2 focus-visible:ring-[--primary]"
              aria-label={org.status === "ARCHIVED" ? `Reactivate ${org.name}` : `Archive ${org.name}`}
            >
              {org.status === "ARCHIVED" ? <ArchiveRestore size={14} /> : <Archive size={14} />}
              {org.status === "ARCHIVED" ? "Reactivate" : "Archive"}
            </button>
          </form>
        )}
      </div>
    </article>
  )
}
