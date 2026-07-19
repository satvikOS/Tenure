import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { FileText, Download, Eye, Sparkles, Trash2 } from "@/components/ui/icons"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canContribute, canManageRoster, canViewOrg, getUserContext } from "@/lib/rbac"
import { storageConfigured } from "@/lib/s3"
import { aiConfigured } from "@/lib/ai"
import { Card, CardHeader } from "@/components/ui/Card"
import { OrgTabs } from "@/components/OrgTabs"
import {
  deleteDocumentAction,
  downloadDocumentAction,
  uploadDocumentAction,
} from "./actions"

export const dynamic = "force-dynamic"

function formatBytes(n?: number | null) {
  if (!n) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const org = await db.organization.findUnique({ where: { slug } })
  if (!org) notFound()

  const ctx = await getUserContext(session.user.id)
  if (!canViewOrg(ctx, org)) notFound()
  const canUpload = canContribute(ctx, org) && storageConfigured()

  const docs = await db.document.findMany({
    where: { organizationId: org.id, isArchived: false },
    orderBy: { createdAt: "desc" },
  })

  const uploaderIds = [...new Set(docs.map((d) => d.createdById).filter((x): x is string => !!x))]
  const uploaders = new Map(
    (
      await db.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, name: true } })
    ).map((u) => [u.id, u.name ?? "Unknown"])
  )

  const uploadWithSlug = uploadDocumentAction.bind(null, slug)
  const downloadWithSlug = downloadDocumentAction.bind(null, slug)
  const deleteWithSlug = deleteDocumentAction.bind(null, slug)
  const canManage = canManageRoster(ctx, org)
  const userId = session.user.id

  return (
    <div className="w-full">
      <div className="mb-4">
        <h1 className="text-text-1">{org.name}</h1>
        <p className="text-sm text-text-2 mt-1">
          Club documents — contracts, templates, and records in one durable place.
        </p>
      </div>
      <OrgTabs slug={slug} />

      <div className="space-y-4">
        {canUpload && (
          <Card>
            <CardHeader title="Upload a document" subtitle="Up to 15 MB during the pilot." />
            <form action={uploadWithSlug} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-2">
                File
                <input
                  type="file"
                  name="file"
                  required
                  className="text-sm text-text-1 file:mr-3 file:h-9 file:rounded file:border file:border-border file:bg-surface file:px-3 file:text-sm file:text-text-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-2 flex-1 min-w-44">
                Title (optional)
                <input
                  name="title"
                  maxLength={200}
                  placeholder="Defaults to the file name"
                  className="h-9 w-full rounded border border-border px-3 text-sm text-text-1"
                />
              </label>
              <button className="h-9 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:opacity-90">
                Upload
              </button>
            </form>
          </Card>
        )}

        {docs.length === 0 ? (
          <Card>
            <p className="text-sm text-text-2 py-4 text-center">
              No documents yet.{canUpload ? " Upload the first one above." : ""}
            </p>
          </Card>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-border">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3.5">
                  <FileText size={16} className="text-text-3 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-1 truncate">{d.title}</p>
                    <p className="text-xs text-text-3 mt-0.5">
                      {formatBytes(d.sizeBytes)} ·{" "}
                      {d.createdById ? uploaders.get(d.createdById) : "Unknown"} ·{" "}
                      {d.createdAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {aiConfigured() && (
                      <Link
                        href={`/orgs/${slug}/documents/${d.id}/summary`}
                        className="inline-flex items-center gap-1.5 h-8 rounded border border-border px-3 text-xs font-medium text-[--primary] hover:bg-base no-underline"
                        aria-label={`Summarize ${d.title}`}
                      >
                        <Sparkles size={13} /> Summarize
                      </Link>
                    )}
                    <Link
                      href={`/orgs/${slug}/documents/${d.id}/view`}
                      className="inline-flex items-center gap-1.5 h-8 rounded border border-border px-3 text-xs font-medium text-text-2 hover:bg-base no-underline"
                      aria-label={`View ${d.title}`}
                    >
                      <Eye size={13} /> View
                    </Link>
                    <form action={downloadWithSlug}>
                      <input type="hidden" name="documentId" value={d.id} />
                      <button
                        className="inline-flex items-center gap-1.5 h-8 rounded border border-border px-3 text-xs font-medium text-text-2 hover:bg-base"
                        aria-label={`Download ${d.title}`}
                      >
                        <Download size={13} /> Download
                      </button>
                    </form>
                    {(canManage || d.createdById === userId) && (
                      <form action={deleteWithSlug}>
                        <input type="hidden" name="documentId" value={d.id} />
                        <button
                          className="inline-flex items-center gap-1.5 h-8 rounded border border-border px-3 text-xs font-medium hover:bg-base"
                          style={{ color: "var(--error)" }}
                          aria-label={`Delete ${d.title}`}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
