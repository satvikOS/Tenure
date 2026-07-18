import Link from "next/link"
import { redirect } from "next/navigation"
import { Users, Archive, ArchiveRestore } from "lucide-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext, isOse, isOseDirector } from "@/lib/rbac"
import { Card, CardHeader } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { createClub, setClubStatus } from "./actions"

export const dynamic = "force-dynamic"

const CATEGORY_LABELS = {
  ORGANIZATION: "Organizations",
  PROFESSIONAL: "Professional",
  COMMUNITY: "Community",
  SOCIAL: "Social",
} as const
const CATEGORY_ORDER = ["ORGANIZATION", "PROFESSIONAL", "COMMUNITY", "SOCIAL"] as const

export default async function OrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category: categoryParam } = await searchParams
  const activeCategory = CATEGORY_ORDER.find((c) => c === categoryParam) ?? null

  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const ctx = await getUserContext(session.user.id)
  const oseInstitutionIds = ctx.institutionRoles.map((m) => m.institutionId)
  const memberOrgIds = ctx.orgRoles
    .filter((r) => r.status === "SHADOW" || r.status === "ACTIVE")
    .map((r) => r.organizationId)

  const orgs = await db.organization.findMany({
    where: {
      OR: [
        { institutionId: { in: oseInstitutionIds } },
        { id: { in: memberOrgIds } },
      ],
    },
    orderBy: { name: "asc" },
    include: {
      roles: {
        include: {
          assignments: {
            where: { status: "ACTIVE" },
            include: { user: { select: { name: true } } },
          },
          holdings: {
            where: { isCurrent: true },
            include: { person: { select: { name: true } } },
          },
        },
      },
    },
  })

  const isOseViewer = orgs.some((o) => isOse(ctx, o.institutionId))
  const isDirector = orgs.some((o) => isOseDirector(ctx, o.institutionId)) ||
    ctx.institutionRoles.some((m) => m.role === "OSE_DIRECTOR")

  const visible = orgs.filter((o) => o.status !== "ARCHIVED" || isOseViewer)

  // Counts come from everything visible, so the chips keep their totals when
  // one category is selected.
  const countByCategory = new Map<string, number>()
  for (const o of visible) {
    countByCategory.set(o.category, (countByCategory.get(o.category) ?? 0) + 1)
  }

  const byCategory = new Map<string, typeof orgs>()
  for (const o of visible) {
    if (activeCategory && o.category !== activeCategory) continue
    byCategory.set(o.category, [...(byCategory.get(o.category) ?? []), o])
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-text-1">
          {isOseViewer ? "All Clubs" : "My Clubs"}
        </h1>
        <p className="text-sm text-text-2 mt-1">
          {isOseViewer
            ? "Every registered organization at your institution."
            : "Organizations where you hold a current or incoming role."}
        </p>
      </div>

      {/* Category filter — URL-driven so a filtered view is shareable */}
      <nav aria-label="Filter clubs by category" className="mb-6 flex flex-wrap gap-2">
        {[
          { key: null, label: "All", count: visible.length },
          ...CATEGORY_ORDER.map((c) => ({
            key: c as string | null,
            label: CATEGORY_LABELS[c],
            count: countByCategory.get(c) ?? 0,
          })),
        ]
          .filter((chip) => chip.key === null || chip.count > 0)
          .map((chip) => {
            const selected = activeCategory === chip.key
            return (
              <Link
                key={chip.label}
                href={chip.key ? `/orgs?category=${chip.key}` : "/orgs"}
                aria-current={selected ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium no-underline transition-colors ${
                  selected
                    ? "border-[--primary] bg-[--primary] text-white"
                    : "border-border text-text-2 hover:border-[--border-strong] hover:text-text-1"
                }`}
              >
                {chip.label}
                <span className={selected ? "opacity-80" : "text-text-3"}>{chip.count}</span>
              </Link>
            )
          })}
      </nav>

      {isDirector && (
        <Card className="mb-6">
          <CardHeader
            title="Charter a new club"
            subtitle="Creates the club with standard board seats — each with a permanent position ID."
          />
          <form action={createClub} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-text-2 flex-1 min-w-48">
              Club name
              <input
                name="name"
                required
                maxLength={120}
                placeholder="Simon Real Estate Club"
                className="h-9 w-full rounded border border-border px-3 text-sm text-text-1"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-2">
              Category
              <select
                name="category"
                required
                className="h-9 rounded border border-border px-2 text-sm text-text-1 bg-surface"
              >
                <option value="PROFESSIONAL">Professional</option>
                <option value="COMMUNITY">Community</option>
                <option value="ORGANIZATION">Organization</option>
                <option value="SOCIAL">Social</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-2 flex-1 min-w-48">
              Description
              <input
                name="description"
                placeholder="What the club does"
                className="h-9 w-full rounded border border-border px-3 text-sm text-text-1"
              />
            </label>
            <button className="h-9 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:opacity-90">
              Charter club
            </button>
          </form>
        </Card>
      )}

      {orgs.length === 0 ? (
        <Card>
          <p className="text-sm text-text-2">
            No organizations yet. Ask your OSE office for access.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((cat) => (
            <div key={cat}>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-3 mb-2">
                {CATEGORY_LABELS[cat]} ({byCategory.get(cat)!.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {byCategory.get(cat)!.map((org) => {
                  const presidentSeat = org.roles.find((r) => r.scope === "PRESIDENT")
                  // Prefer the published roster holder over a demo account
                  const president =
                    presidentSeat?.holdings[0]?.person.name ??
                    presidentSeat?.assignments[0]?.user?.name
                  const boardSeats = org.roles.filter((r) => r.name !== "Member")
                  const filledSeats = boardSeats.filter(
                    (r) => r.holdings.length > 0 || r.assignments.length > 0
                  ).length
                  const vacancies = boardSeats.length - filledSeats
                  return (
                    <div key={org.id} className="relative">
                      <Link href={`/orgs/${org.slug}/members`} className="no-underline">
                        <Card className="hover:border-[--primary] transition-colors h-full">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h2 className="text-sm font-semibold text-text-1">{org.name}</h2>
                              {org.description && (
                                <p className="text-xs text-text-2 mt-1 line-clamp-2">
                                  {org.description}
                                </p>
                              )}
                            </div>
                            <Badge variant={org.status === "ACTIVE" ? "success" : "default"}>
                              {org.status.toLowerCase()}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-xs text-text-3">
                            <span className="inline-flex items-center gap-1">
                              <Users size={13} /> {filledSeats}/{boardSeats.length} seats filled
                            </span>
                            {vacancies > 0 && (
                              <span className="text-[--warning]">
                                {vacancies} vacant
                              </span>
                            )}
                            {president && <span>President: {president}</span>}
                          </div>
                        </Card>
                      </Link>
                      {isDirector && (
                        <form action={setClubStatus} className="absolute bottom-3 right-3">
                          <input type="hidden" name="organizationId" value={org.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={org.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"}
                          />
                          <button
                            className="inline-flex items-center gap-1 text-xs text-text-3 hover:text-text-1"
                            aria-label={org.status === "ACTIVE" ? `Archive ${org.name}` : `Reactivate ${org.name}`}
                          >
                            {org.status === "ACTIVE" ? (
                              <Archive size={12} />
                            ) : (
                              <ArchiveRestore size={12} />
                            )}
                            {org.status === "ACTIVE" ? "Archive" : "Reactivate"}
                          </button>
                        </form>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
