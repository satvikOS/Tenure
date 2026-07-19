import Link from "next/link"
import { redirect } from "next/navigation"
import { ExternalLink, AlertCircle } from "@/components/ui/icons"
import { auth } from "@/lib/auth"
import { getUserContext, isOse } from "@/lib/rbac"
import { Badge } from "@/components/ui/Badge"
import {
  KIND_LABELS,
  RESOURCES,
  SEAT_LABELS,
  seatKeysForRole,
  type Resource,
  type SeatKey,
} from "@/lib/resources"

export const dynamic = "force-dynamic"

const SEAT_ORDER: SeatKey[] = [
  "ALL",
  "PRESIDENT",
  "VP_FINANCE",
  "VP_EVENTS",
  "VP_MARKETING",
  "MBA_REP",
  "OSE",
]

function ResourceCard({ resource, highlight }: { resource: Resource; highlight: boolean }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-1">{resource.title}</h3>
        {resource.external && (
          <ExternalLink size={13} className="mt-0.5 shrink-0 text-text-3" aria-hidden />
        )}
      </div>
      <p className="mt-1 text-xs text-text-2">{resource.description}</p>
      {resource.rule && (
        <p className="mt-2 flex items-start gap-1.5 rounded bg-[--warning-light] px-2 py-1.5 text-[11px] text-text-1">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-[--warning]" aria-hidden />
          {resource.rule}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        <Badge variant="default">{KIND_LABELS[resource.kind]}</Badge>
        {!resource.ready && <Badge variant="info">Being built</Badge>}
      </div>
    </>
  )

  const className = `block h-full rounded-lg border p-4 no-underline transition-colors ${
    highlight
      ? "border-[--primary] bg-surface hover:bg-base"
      : "border-border bg-surface hover:border-[--border-strong]"
  }`

  if (!resource.ready) {
    return (
      <div className={`${className} cursor-default opacity-70`} aria-disabled="true">
        {body}
      </div>
    )
  }

  return resource.external ? (
    <a href={resource.href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <Link href={resource.href} className={className}>
      {body}
    </Link>
  )
}

export default async function ResourcesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const ctx = await getUserContext(session.user.id)

  // Which audiences this person belongs to, from every seat they hold
  const mySeats = new Set<SeatKey>(["ALL"])
  for (const role of ctx.orgRoles) {
    if (role.status === "ALUMNI") continue
    for (const key of seatKeysForRole(role.roleName)) mySeats.add(key)
  }
  if (ctx.institutionRoles.length > 0) mySeats.add("OSE")
  const isOseViewer = ctx.institutionRoles.some((m) => isOse(ctx, m.institutionId))

  const groups = SEAT_ORDER.map((seat) => ({
    seat,
    // OSE sees the whole board; everyone else sees their own sections first
    resources: RESOURCES.filter((r) => r.seats.includes(seat)),
    mine: mySeats.has(seat),
  })).filter((g) => g.resources.length > 0 && (isOseViewer || g.mine || g.seat !== "OSE"))

  const ordered = [...groups].sort((a, b) => Number(b.mine) - Number(a.mine))

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-text-1">Board Resources</h1>
        <p className="mt-1 text-sm text-text-2">
          Every form, guide and policy your seat needs — so it survives the
          handoff instead of living in someone&apos;s bookmarks.
        </p>
      </div>

      <div className="space-y-8">
        {ordered.map(({ seat, resources, mine }) => (
          <section key={seat} aria-labelledby={`seat-${seat}`}>
            <div className="mb-3 flex items-center gap-2">
              <h2
                id={`seat-${seat}`}
                className="text-xs font-semibold uppercase tracking-wide text-text-3"
              >
                {SEAT_LABELS[seat]}
              </h2>
              {mine && seat !== "ALL" && <Badge variant="success">Your seat</Badge>}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {resources.map((r) => (
                <ResourceCard key={`${seat}-${r.id}`} resource={r} highlight={mine} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
