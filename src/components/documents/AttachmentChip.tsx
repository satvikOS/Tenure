"use client"

import { useState } from "react"
import { Download, Paperclip } from "@/components/ui/icons"
import { Overlay } from "@/components/ui/Overlay"
import { DocContentView } from "@/components/documents/DocContentView"

function formatBytes(n: number | null): string {
  if (!n) return ""
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const chipClass =
  "inline-flex items-center gap-2 rounded-md border border-border bg-base px-3 py-1.5 text-[13px] text-text-1 no-underline transition-colors hover:border-[--primary]"

/**
 * A single message-attachment chip.
 *
 * Images preview in the shared overlay: the `<img>` loads through the
 * ACL-protected `/api/attachment/[id]` route and renders regardless of that
 * route's attachment `Content-Disposition`. Every other type keeps the plain
 * signed-URL download link — there is no attachment content API, and an
 * attachment-disposition URL can't be framed (pdf) or cross-origin-fetched
 * (text/json/xml) reliably, so those degrade to a download. Attachments are
 * never editable.
 */
export function AttachmentChip({
  id,
  fileName,
  mimeType,
  sizeBytes,
}: {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number | null
}) {
  const [open, setOpen] = useState(false)
  const size = formatBytes(sizeBytes)
  const href = `/api/attachment/${id}`

  const inner = (
    <>
      <Paperclip size={14} className="text-text-3" />
      <span className="max-w-[200px] truncate">{fileName}</span>
      {size ? <span className="text-text-3">{size}</span> : null}
    </>
  )

  if (!mimeType.startsWith("image/")) {
    return (
      <a href={href} className={chipClass}>
        {inner}
      </a>
    )
  }

  return (
    <>
      <button
        type="button"
        data-testid="attachment-preview"
        onClick={() => setOpen(true)}
        className={chipClass}
      >
        {inner}
      </button>

      <Overlay
        isOpen={open}
        onOpenChange={setOpen}
        size="xl"
        title={fileName}
        description={[mimeType, size].filter(Boolean).join(" · ")}
      >
        <div className="space-y-3">
          <DocContentView content={{ kind: "image", url: href }} title={fileName} />
          <a
            href={href}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-2 no-underline hover:bg-base"
          >
            <Download size={13} /> Download
          </a>
        </div>
      </Overlay>
    </>
  )
}
