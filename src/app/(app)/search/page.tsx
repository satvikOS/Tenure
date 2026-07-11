import Link from "next/link"
import { redirect } from "next/navigation"
import { Brain, FileText, CalendarDays, CheckCircle, Building2, BookOpen } from "lucide-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { canSeeMemoryCard } from "@/lib/memory"
import { rankDocs, type SearchDoc } from "@/lib/search"
import { aiConfigured, synthesizeAnswer } from "@/lib/ai"
import { Card, CardHeader } from "@/components/ui/Card"

export const dynamic = "force-dynamic"

const KIND_ICON = {
  memory: BookOpen,
  document: FileText,
  approval: CheckCircle,
  event: CalendarDays,
  organization: Building2,
} as const

/** Everything this user is allowed to see, flattened for ranking. */
async function loadCorpus(userId: string): Promise<SearchDoc[]> {
  const ctx = await getUserContext(userId)
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
    select: { id: true, institutionId: true, name: true, slug: true, description: true },
  })
  const orgById = new Map(orgs.map((o) => [o.id, o]))
  const orgIds = orgs.map((o) => o.id)

  const [memory, documents, approvals, events] = await Promise.all([
    db.memoryRecord.findMany({
      where: { organizationId: { in: orgIds }, isArchived: false },
      select: {
        id: true, title: true, content: true, roleId: true, organizationId: true,
      },
    }),
    db.document.findMany({
      where: { organizationId: { in: orgIds }, isArchived: false },
      select: { id: true, title: true, description: true, organizationId: true },
    }),
    db.approvalRequest.findMany({
      where: {
        OR: [
          { organizationId: { in: orgIds } },
          { submittedById: userId },
        ],
      },
      select: { id: true, title: true, description: true, status: true, organizationId: true },
    }),
    db.event.findMany({
      where: { organizationId: { in: orgIds }, status: { not: "CANCELLED" } },
      select: { id: true, title: true, description: true, venue: true, organizationId: true },
    }),
  ])

  const docs: SearchDoc[] = []

  for (const m of memory) {
    const org = orgById.get(m.organizationId)
    if (!org) continue
    // Seat-scoped cards stay invisible in search too
    if (!canSeeMemoryCard(ctx, m, org)) continue
    docs.push({
      id: m.id,
      kind: "memory",
      title: m.title,
      body: (m.content as { body?: string }).body ?? "",
      href: `/orgs/${org.slug}/memory`,
      context: org.name,
    })
  }
  for (const d of documents) {
    const org = orgById.get(d.organizationId)
    if (!org) continue
    docs.push({
      id: d.id,
      kind: "document",
      title: d.title,
      body: d.description ?? "",
      href: `/orgs/${org.slug}/documents`,
      context: org.name,
    })
  }
  for (const a of approvals) {
    const org = orgById.get(a.organizationId)
    docs.push({
      id: a.id,
      kind: "approval",
      title: a.title,
      body: `${a.description ?? ""} status:${a.status.toLowerCase()}`,
      href: `/approvals/${a.id}`,
      context: org?.name ?? "Approvals",
    })
  }
  for (const e of events) {
    const org = orgById.get(e.organizationId)
    if (!org) continue
    docs.push({
      id: e.id,
      kind: "event",
      title: e.title,
      body: `${e.description ?? ""} ${e.venue ?? ""}`,
      href: `/calendar/${e.id}`,
      context: org.name,
    })
  }
  for (const o of orgs) {
    docs.push({
      id: o.id,
      kind: "organization",
      title: o.name,
      body: o.description ?? "",
      href: `/orgs/${o.slug}/members`,
      context: "Club",
    })
  }
  return docs
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const query = (q ?? "").trim()
  const results = query ? rankDocs(await loadCorpus(session.user.id), query) : []
  const answer = query ? await synthesizeAnswer(query, results.slice(0, 6)) : null

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-1">Search</h1>
        <p className="text-sm text-text-2 mt-1">
          Ask across everything you have access to — answers cite their sources.
        </p>
      </div>

      <form action="/search" method="get" className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Who is our catering contact? What's pending approval?"
          className="h-10 flex-1 rounded border border-border px-3 text-sm text-text-1"
          autoFocus
        />
        <button className="h-10 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:opacity-90">
          Search
        </button>
      </form>

      {query && (
        <div className="space-y-4">
          {answer && (
            <Card>
              <CardHeader
                title="Answer"
                subtitle="Generated only from the cited sources below"
                action={<Brain size={16} className="text-[--primary]" />}
              />
              <p className="text-sm text-text-1 whitespace-pre-wrap">{answer}</p>
            </Card>
          )}
          {!answer && aiConfigured() && results.length > 0 && (
            <p className="text-xs text-text-3">
              Answer generation was unavailable — showing sources.
            </p>
          )}

          <Card padding="none">
            <div className="p-5 border-b border-border">
              <CardHeader
                title={results.length ? `Sources (${results.length})` : "No results"}
                subtitle={
                  results.length
                    ? "Everything below respects your role's access"
                    : "Nothing you can access matches that query."
                }
              />
            </div>
            {results.length > 0 && (
              <ol className="divide-y divide-border">
                {results.map((r, i) => {
                  const Icon = KIND_ICON[r.kind]
                  return (
                    <li key={`${r.kind}-${r.id}`}>
                      <Link
                        href={r.href}
                        className="flex items-start gap-3 px-5 py-3.5 hover:bg-base transition-colors no-underline"
                      >
                        <span className="text-xs font-semibold text-text-3 mt-0.5 w-6 shrink-0">
                          [{i + 1}]
                        </span>
                        <Icon size={15} className="text-text-3 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-1">{r.title}</p>
                          {r.snippet && (
                            <p className="text-xs text-text-2 mt-0.5 line-clamp-2">{r.snippet}</p>
                          )}
                          <p className="text-xs text-text-3 mt-0.5">
                            {r.kind} · {r.context}
                          </p>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
