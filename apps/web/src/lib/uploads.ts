/**
 * What Tenure accepts as an upload — decided from the file's BYTES.
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 * Uploads used to be admitted on size alone, and the Content-Type stored beside
 * them was whatever the browser claimed (`file.type`, a string the client picks
 * and can set to anything). That claim was written to S3, written to the
 * Document / Attachment row, and echoed back when the object was served. So
 * anyone who could upload could store a `text/html` "document", hand out the
 * link, and have a browser render it as a page inside Tenure's own origin —
 * stored XSS with the session cookie attached, no parser bug required.
 *
 * Nothing here trusts the claim. The extension is what the user SAYS the file
 * is; the leading bytes are what it IS; the two must agree, and the
 * Content-Type that gets stored and later served is derived from the bytes.
 * The client's `file.type` is never an input to this decision — it is not even
 * a parameter, so it cannot leak back in.
 *
 * ── Shape ───────────────────────────────────────────────────────────────────
 * Pure and isomorphic on purpose: no Buffer, no fs, no S3, no I/O. The verdict
 * is a function of (name, bytes, limit), which is what makes it unit-testable
 * against real magic bytes — see uploads.test.ts.
 */

/**
 * Per-file ceiling for every upload surface (documents, receipts, attachments).
 *
 * It is also the ceiling for one whole request: uploads arrive through Server
 * Actions, whose body cap (`serverActions.bodySizeLimit` in next.config.ts) is
 * the backstop that stops a request before any of this code runs. The two are
 * deliberately close — 15 MB of payload under a 16 MB cap, leaving room for
 * multipart framing — so that a file this module would accept can never be one
 * the transport silently rejects first.
 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

/** How many files one message may carry. */
export const MAX_FILES_PER_REQUEST = 10

/** Avatars and club logos are displayed small; they get a tighter ceiling. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** What the bytes actually are, independent of what the file is called. */
export type SniffedKind =
  | "pdf"
  | "docx"
  | "xlsx"
  | "pptx"
  | "zip"
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "text"
  | "markup"
  | "empty"
  | "unknown"

interface UploadFormat {
  /** Human name, used in the rejection message. */
  label: string
  /** The Content-Type Tenure stores and serves for this format. */
  contentType: string
  /** Sniffed kinds this extension may legitimately carry. */
  kinds: readonly SniffedKind[]
}

/**
 * The allowlist: the formats this product actually handles. Keyed by the
 * lowercase extension the user must name the file with — an upload has to
 * clear BOTH this table and the byte sniff, and they have to agree.
 *
 * Deliberately absent: SVG (markup that executes when rendered inline), HTML,
 * and every archive/executable format. Legacy .doc/.xls/.ppt are absent too —
 * the viewer cannot parse them, so accepting them only creates dead objects.
 */
const ALLOWED_EXTENSIONS: Readonly<Record<string, UploadFormat>> = {
  pdf: { label: "PDF", contentType: "application/pdf", kinds: ["pdf"] },
  docx: {
    label: "Word document",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kinds: ["docx"],
  },
  xlsx: {
    label: "Excel workbook",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kinds: ["xlsx"],
  },
  pptx: {
    label: "PowerPoint deck",
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    kinds: ["pptx"],
  },
  csv: { label: "CSV file", contentType: "text/csv", kinds: ["text"] },
  txt: { label: "text file", contentType: "text/plain", kinds: ["text"] },
  png: { label: "PNG image", contentType: "image/png", kinds: ["png"] },
  jpg: { label: "JPEG image", contentType: "image/jpeg", kinds: ["jpeg"] },
  jpeg: { label: "JPEG image", contentType: "image/jpeg", kinds: ["jpeg"] },
  gif: { label: "GIF image", contentType: "image/gif", kinds: ["gif"] },
  webp: { label: "WebP image", contentType: "image/webp", kinds: ["webp"] },
}

/** One-line list of what a user may upload, shown in forms and in errors. */
export const ACCEPTED_UPLOADS_SUMMARY =
  "PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), CSV, text, PNG, JPEG, GIF or WebP"

/**
 * A subset of the allowlist a particular surface accepts, with the prose used
 * when something outside it is offered. Avatars and club logos take images
 * only; document libraries take everything.
 */
export interface AcceptSet {
  extensions: readonly string[]
  summary: string
}

export const ACCEPT_ANY_DOCUMENT: AcceptSet = {
  extensions: Object.keys(ALLOWED_EXTENSIONS),
  summary: ACCEPTED_UPLOADS_SUMMARY,
}

export const ACCEPT_IMAGE: AcceptSet = {
  extensions: ["png", "jpg", "jpeg", "gif", "webp"],
  summary: "PNG, JPEG, GIF or WebP",
}

/** The `accept` attribute for a file input, so the picker matches the server. */
export function acceptAttribute(accept: AcceptSet = ACCEPT_ANY_DOCUMENT): string {
  return accept.extensions.map((ext) => `.${ext}`).join(",")
}

/** Every extension in the allowlist, for the file input's `accept` attribute. */
export const UPLOAD_ACCEPT_ATTRIBUTE = acceptAttribute()

/** Content-Types this app is willing to emit for a stored object. */
const SERVEABLE_CONTENT_TYPES: ReadonlySet<string> = new Set(
  Object.values(ALLOWED_EXTENSIONS).map((f) => f.contentType)
)

export type UploadVerdict =
  | { ok: true; contentType: string; extension: string; kind: SniffedKind }
  | { ok: false; reason: string }

// ─── Byte sniffing ───────────────────────────────────────────────────────────

/** ASCII/byte-sequence prefix test, offset-aware. */
function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false
  }
  return true
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0))
}

const PDF = ascii("%PDF-")
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff]
const GIF87 = ascii("GIF87a")
const GIF89 = ascii("GIF89a")
const RIFF = ascii("RIFF")
const WEBP = ascii("WEBP")
const ZIP_LOCAL = [0x50, 0x4b, 0x03, 0x04] // "PK\x03\x04"
const ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06]
const ZIP_SPANNED = [0x50, 0x4b, 0x07, 0x08]
const UTF8_BOM = [0xef, 0xbb, 0xbf]

/**
 * Entry names from a ZIP's local file headers. Names are stored uncompressed,
 * so this needs no inflate — walk every `PK\x03\x04` signature and read the
 * name that follows its 30-byte header. A signature that happens to occur
 * inside compressed data yields a junk name, which is harmless: callers only
 * ask whether specific OPC parts are present.
 */
function zipEntryNames(bytes: Uint8Array, maxEntries = 2048): string[] {
  const names: string[] = []
  for (let at = 0; at + 30 <= bytes.length && names.length < maxEntries; at++) {
    if (bytes[at] !== ZIP_LOCAL[0] || !startsWith(bytes, ZIP_LOCAL, at)) continue
    const nameLength = bytes[at + 26] | (bytes[at + 27] << 8)
    const start = at + 30
    if (nameLength === 0 || start + nameLength > bytes.length) continue
    let name = ""
    for (let i = 0; i < nameLength; i++) name += String.fromCharCode(bytes[start + i])
    names.push(name)
    at = start + nameLength - 1 // skip past the name we just read
  }
  return names
}

/**
 * Which Office format a ZIP is — or plain `"zip"` if it is just a ZIP.
 *
 * docx/xlsx/pptx ARE zips, so the signature alone cannot tell them apart from
 * an arbitrary archive renamed to .docx. Every OPC package must carry
 * `[Content_Types].xml`, and each format puts its body under its own top-level
 * part directory (word/ · xl/ · ppt/). Both must be present.
 */
function ooxmlKind(bytes: Uint8Array): SniffedKind {
  const names = zipEntryNames(bytes)
  if (!names.includes("[Content_Types].xml")) return "zip"
  if (names.some((n) => n.startsWith("word/"))) return "docx"
  if (names.some((n) => n.startsWith("xl/"))) return "xlsx"
  if (names.some((n) => n.startsWith("ppt/"))) return "pptx"
  return "zip"
}

/**
 * True when a leading `<` (after any BOM/whitespace) makes this markup. A
 * browser asked to sniff such a file treats it as HTML regardless of the
 * Content-Type, which is precisely the primitive being closed — so it is
 * rejected even for .txt and .csv.
 */
function looksLikeMarkup(bytes: Uint8Array): boolean {
  let i = startsWith(bytes, UTF8_BOM) ? 3 : 0
  while (i < bytes.length && (bytes[i] === 0x20 || (bytes[i] >= 0x09 && bytes[i] <= 0x0d))) i++
  return i < bytes.length && bytes[i] === 0x3c // "<"
}

/**
 * True when every byte is printable text. Control characters (other than tab,
 * newline, form feed, carriage return) mean binary. High bytes are allowed:
 * Excel still exports CSV as Windows-1252 and those files are legitimate.
 */
function looksLikeText(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d) continue
    if (b < 0x20 || b === 0x7f) return false
  }
  return true
}

/**
 * What these bytes actually are. Signatures are checked at offset 0 — every
 * real producer writes them there, and tolerating a leading offset is how a
 * polyglot file (valid PDF *and* valid HTML) gets in.
 */
export function sniffBytes(bytes: Uint8Array): SniffedKind {
  if (bytes.length === 0) return "empty"
  if (startsWith(bytes, PDF)) return "pdf"
  if (startsWith(bytes, PNG)) return "png"
  if (startsWith(bytes, JPEG)) return "jpeg"
  if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) return "gif"
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "webp"
  if (
    startsWith(bytes, ZIP_LOCAL) ||
    startsWith(bytes, ZIP_EMPTY) ||
    startsWith(bytes, ZIP_SPANNED)
  ) {
    return ooxmlKind(bytes)
  }
  if (looksLikeMarkup(bytes)) return "markup"
  if (looksLikeText(bytes)) return "text"
  return "unknown"
}

// ─── The allowlist decision ──────────────────────────────────────────────────

/** Lowercase extension without the dot, or "" when the name has none. */
export function fileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? ""
  const dot = base.lastIndexOf(".")
  if (dot <= 0 || dot === base.length - 1) return ""
  return base.slice(dot + 1).toLowerCase()
}

function describeKind(kind: SniffedKind): string {
  switch (kind) {
    case "pdf":
      return "a PDF"
    case "docx":
      return "a Word document"
    case "xlsx":
      return "an Excel workbook"
    case "pptx":
      return "a PowerPoint deck"
    case "zip":
      return "a ZIP archive"
    case "png":
      return "a PNG image"
    case "jpeg":
      return "a JPEG image"
    case "gif":
      return "a GIF image"
    case "webp":
      return "a WebP image"
    case "markup":
      return "HTML or XML markup"
    case "text":
      return "plain text"
    default:
      return "not a format Tenure recognises"
  }
}

function describeSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} bytes`
}

/** The ceiling reads as the round number it is ("15 MB", not "15.0 MB"). */
function describeLimit(maxBytes: number): string {
  const mb = maxBytes / 1024 / 1024
  return Number.isInteger(mb) ? `${mb} MB` : describeSize(maxBytes)
}

/**
 * The one admission decision for every upload surface. Every rejection names
 * the file and says what was wrong with it, because a user picking ten
 * attachments cannot act on "upload failed".
 *
 * On success `contentType` comes from the SNIFFED bytes — store that on the
 * object and on the row, never `file.type`.
 */
export function inspectUpload(file: {
  fileName: string
  bytes: Uint8Array
  maxBytes?: number
  accept?: AcceptSet
}): UploadVerdict {
  const { fileName, bytes, maxBytes = MAX_UPLOAD_BYTES, accept = ACCEPT_ANY_DOCUMENT } = file
  const name = fileName.trim() || "This file"

  if (bytes.length === 0) {
    return { ok: false, reason: `“${name}” is empty — there is nothing to upload.` }
  }
  if (bytes.length > maxBytes) {
    return {
      ok: false,
      reason: `“${name}” is ${describeSize(bytes.length)} — the limit is ${describeLimit(maxBytes)}.`,
    }
  }

  const extension = fileExtension(name)
  const format = accept.extensions.includes(extension) ? ALLOWED_EXTENSIONS[extension] : undefined
  if (!format) {
    return {
      ok: false,
      reason: `“${name}” is not a file type Tenure accepts. Upload a ${accept.summary} file.`,
    }
  }

  const kind = sniffBytes(bytes)
  if (!format.kinds.includes(kind)) {
    return {
      ok: false,
      reason: `“${name}” is not a ${format.label}: its contents are ${describeKind(kind)}. Upload a real ${format.label}.`,
    }
  }

  return { ok: true, contentType: format.contentType, extension, kind }
}

/** An accepted file, paired back with the index it arrived at. */
export interface AcceptedUpload {
  index: number
  fileName: string
  contentType: string
  extension: string
}

export type BatchVerdict =
  | { ok: true; accepted: AcceptedUpload[] }
  | { ok: false; reason: string }

/**
 * The same decision for a set of files arriving in ONE request (a message and
 * its attachments). All-or-nothing on purpose: a message that half-sends its
 * attachments is worse than one that refuses and says why, and the sender is
 * still holding the files.
 *
 * The aggregate ceiling matters as much as the per-file one — ten 14 MB files
 * each pass `inspectUpload` and together blow past the Server Action body cap,
 * which fails the whole request with a message no user can act on.
 */
export function inspectUploads(
  files: readonly { fileName: string; bytes: Uint8Array }[],
  limits: { maxFiles?: number; maxBytes?: number; maxTotalBytes?: number } = {}
): BatchVerdict {
  const {
    maxFiles = MAX_FILES_PER_REQUEST,
    maxBytes = MAX_UPLOAD_BYTES,
    maxTotalBytes = MAX_UPLOAD_BYTES,
  } = limits

  if (files.length > maxFiles) {
    return {
      ok: false,
      reason: `You can attach up to ${maxFiles} files at once — that was ${files.length}.`,
    }
  }

  const total = files.reduce((sum, f) => sum + f.bytes.length, 0)
  if (total > maxTotalBytes) {
    return {
      ok: false,
      reason: `Those files come to ${describeSize(total)} together — one message can carry ${describeLimit(maxTotalBytes)}.`,
    }
  }

  const accepted: AcceptedUpload[] = []
  for (const [index, file] of files.entries()) {
    const verdict = inspectUpload({ fileName: file.fileName, bytes: file.bytes, maxBytes })
    if (!verdict.ok) return verdict
    accepted.push({
      index,
      fileName: file.fileName,
      contentType: verdict.contentType,
      extension: verdict.extension,
    })
  }
  return { ok: true, accepted }
}

// ─── Serving ─────────────────────────────────────────────────────────────────

/** The type given to anything Tenure will not vouch for. No browser renders it. */
export const OPAQUE_CONTENT_TYPE = "application/octet-stream"

/**
 * The Content-Type it is safe to emit for a stored object.
 *
 * Rows written before uploads were validated still carry a client-chosen
 * mimeType, so the stored value is sanitised on the way OUT as well as on the
 * way in: anything outside the allowlist degrades to a type no browser will
 * render, rather than being echoed back verbatim.
 */
export function safeServedContentType(storedMimeType: string | null | undefined): string {
  return storedMimeType && SERVEABLE_CONTENT_TYPES.has(storedMimeType)
    ? storedMimeType
    : OPAQUE_CONTENT_TYPE
}

/**
 * The Content-Type for a stored object that has no mimeType column of its own —
 * profile pictures and club logos are keyed, not rowed. The key's extension is
 * server-generated from the accepted format (see the upload actions), so it is
 * a stronger signal here than a stored claim would be.
 */
export function safeContentTypeForKey(objectKey: string): string {
  return ALLOWED_EXTENSIONS[fileExtension(objectKey)]?.contentType ?? OPAQUE_CONTENT_TYPE
}

/**
 * Whether this Content-Type may be handed to a browser with `inline`.
 *
 * Anything Tenure vouches for can be: the allowlist has no format a browser
 * will parse as HTML (no SVG, no markup). Everything else must download —
 * `inline` plus a type the browser is willing to sniff is the rendering path
 * being closed.
 */
export function isInlineSafeContentType(contentType: string): boolean {
  return SERVEABLE_CONTENT_TYPES.has(contentType)
}

/**
 * A `Content-Disposition` that always downloads. The quoted filename is
 * stripped to a safe subset (a raw CR/LF or quote in a file name is header
 * injection), with the real name carried in the RFC 5987 `filename*` form.
 */
export function contentDispositionAttachment(fileName: string): string {
  const fallback = fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120).trim() || "download"
  // encodeURIComponent leaves !'()*~ alone; RFC 5987's attr-char set excludes
  // them, so percent-encode those too.
  const encoded = encodeURIComponent(fileName).replace(
    /['()*!~]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
