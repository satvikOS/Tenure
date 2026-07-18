import { notFound, redirect } from "next/navigation"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import mammoth from "mammoth"
import * as XLSX from "xlsx"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canViewOrg, getUserContext } from "@/lib/rbac"
import { documentsBucket, documentViewUrl } from "@/lib/s3"
import { Card } from "@/components/ui/Card"
import { BackButton } from "@/components/BackButton"

export const dynamic = "force-dynamic"

const MAX_PARSE_BYTES = 10 * 1024 * 1024

function is(mime: string, ...prefixes: string[]) {
  return prefixes.some((p) => mime.startsWith(p) || mime === p)
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const XLS = "application/vnd.ms-excel"

/** Native in-app document viewer: pdf, docx, xlsx/xls/csv, text, images. */
export default async function DocumentViewPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const doc = await db.document.findUnique({
    where: { id },
    include: { organization: true },
  })
  if (!doc || doc.organization.slug !== slug || doc.isArchived) notFound()

  const ctx = await getUserContext(session.user.id)
  if (!canViewOrg(ctx, doc.organization)) notFound()

  await db.auditEvent.create({
    data: {
      institutionId: doc.institutionId,
      organizationId: doc.organizationId,
      actorId: session.user.id,
      action: "Document.Viewed",
      resourceType: "Document",
      resourceId: doc.id,
      outcome: "ALLOW",
    },
  })

  const mime = doc.mimeType
  let content: React.ReactNode = null

  if (!documentsBucket) {
    content = <p className="text-sm text-text-2">Document storage is not configured.</p>
  } else if (is(mime, "application/pdf")) {
    const url = await documentViewUrl(doc.objectKey)
    content = (
      <iframe
        src={url}
        title={doc.title}
        className="w-full rounded border border-border"
        style={{ height: "78vh" }}
      />
    )
  } else if (is(mime, "image/")) {
    const url = await documentViewUrl(doc.objectKey)
    // eslint-disable-next-line @next/next/no-img-element
    content = <img src={url} alt={doc.title} className="max-w-full rounded border border-border" />
  } else if ((doc.sizeBytes ?? 0) > MAX_PARSE_BYTES) {
    content = (
      <p className="text-sm text-text-2">
        This file is too large to preview natively — use Download instead.
      </p>
    )
  } else {
    const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" })
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: documentsBucket, Key: doc.objectKey })
    )
    const bytes = Buffer.from(await obj.Body!.transformToByteArray())

    if (is(mime, DOCX)) {
      const { value } = await mammoth.convertToHtml({ buffer: bytes })
      content = (
        <div
          className="prose-doc text-sm text-text-1 space-y-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_a]:text-[--primary]"
          dangerouslySetInnerHTML={{ __html: value }}
        />
      )
    } else if (is(mime, XLSX_MIME, XLS, "text/csv", "application/csv")) {
      const wb = XLSX.read(bytes, { type: "buffer" })
      const sheets = wb.SheetNames.slice(0, 3)
      content = (
        <div className="space-y-6">
          {sheets.map((name) => {
            const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
              wb.Sheets[name],
              { header: 1, defval: "" }
            ).slice(0, 300) as (string | number | null)[][]
            return (
              <div key={name}>
                {wb.SheetNames.length > 1 && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-3 mb-2">
                    {name}
                  </p>
                )}
                <div className="overflow-x-auto rounded border border-border">
                  <table className="text-xs text-text-1 w-full">
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className={i === 0 ? "bg-base font-semibold" : "odd:bg-surface even:bg-base/50"}>
                          {r.map((c, j) => (
                            <td key={j} className="border border-border px-2 py-1 whitespace-nowrap">
                              {String(c)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )
    } else if (is(mime, "text/", "application/json", "application/xml")) {
      content = (
        <pre className="text-xs text-text-1 whitespace-pre-wrap rounded border border-border bg-base p-4 overflow-x-auto max-h-[70vh]">
          {bytes.toString("utf8").slice(0, 200_000)}
        </pre>
      )
    } else {
      content = (
        <p className="text-sm text-text-2">
          No native preview for <code>{mime}</code> yet — use Download.
        </p>
      )
    }
  }

  return (
    <div className="max-w-screen-xl">
      <BackButton label="Back to documents" />
      <div className="mb-4">
        <h1 className="text-text-1">{doc.title}</h1>
        <p className="text-sm text-text-2 mt-0.5">
          {doc.organization.name} · {mime}
        </p>
      </div>
      <Card>{content}</Card>
    </div>
  )
}
