import JSZip from "jszip"
import {
  ACCEPTED_UPLOADS_SUMMARY,
  ACCEPT_IMAGE,
  MAX_FILES_PER_REQUEST,
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT_ATTRIBUTE,
  acceptAttribute,
  contentDispositionAttachment,
  fileExtension,
  inspectUpload,
  inspectUploads,
  isInlineSafeContentType,
  safeContentTypeForKey,
  safeServedContentType,
  sniffBytes,
} from "./uploads"

/** Real leading bytes, written the way each format's producer writes them. */
const bytes = (...parts: (string | number[])[]): Uint8Array => {
  const out: number[] = []
  for (const p of parts) {
    if (typeof p === "string") for (const c of p) out.push(c.charCodeAt(0))
    else out.push(...p)
  }
  return Uint8Array.from(out)
}

const PDF = bytes("%PDF-1.7\n", [0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a], "1 0 obj\n<< /Type /Catalog >>\n")
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 0x0d], "IHDR")
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], "JFIF", [0x00, 0x01, 0x02, 0x00])
const GIF = bytes("GIF89a", [0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00])
const WEBP = bytes("RIFF", [0x1a, 0x00, 0x00, 0x00], "WEBP", "VP8 ", [0x0e, 0x00, 0x00, 0x00])
const CSV = bytes("Category,Planned Budget\nCatering,1500\n")
const TXT = bytes("Minutes of the 5 September board meeting.\r\n")
const HTML = bytes('<!DOCTYPE html><script>fetch("/api/admin/directory")</script>')

/** A real OPC package: what Word/Excel/PowerPoint actually emit. */
async function ooxml(parts: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
  )
  zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships/>')
  for (const [path, body] of Object.entries(parts)) zip.file(path, body)
  return zip.generateAsync({ type: "uint8array" })
}

let docx: Uint8Array
let xlsx: Uint8Array
let pptx: Uint8Array
let plainZip: Uint8Array

beforeAll(async () => {
  docx = await ooxml({ "word/document.xml": "<w:document/>" })
  xlsx = await ooxml({ "xl/workbook.xml": "<workbook/>" })
  pptx = await ooxml({ "ppt/presentation.xml": "<p:presentation/>" })
  // No [Content_Types].xml, no part directory — an ordinary archive.
  const zip = new JSZip()
  zip.file("notes.txt", "just a zip of a text file")
  plainZip = await zip.generateAsync({ type: "uint8array" })
})

describe("sniffBytes", () => {
  it("recognises every accepted format from its magic bytes", () => {
    expect(sniffBytes(PDF)).toBe("pdf")
    expect(sniffBytes(PNG)).toBe("png")
    expect(sniffBytes(JPEG)).toBe("jpeg")
    expect(sniffBytes(GIF)).toBe("gif")
    expect(sniffBytes(WEBP)).toBe("webp")
    expect(sniffBytes(CSV)).toBe("text")
    expect(sniffBytes(TXT)).toBe("text")
    expect(sniffBytes(docx)).toBe("docx")
    expect(sniffBytes(xlsx)).toBe("xlsx")
    expect(sniffBytes(pptx)).toBe("pptx")
  })

  it("tells the OOXML formats apart from an arbitrary zip", () => {
    // All four start with PK\x03\x04 — the signature alone proves nothing.
    expect(plainZip.slice(0, 4)).toEqual(docx.slice(0, 4))
    expect(sniffBytes(plainZip)).toBe("zip")
  })

  it("calls markup markup, whatever it is named", () => {
    expect(sniffBytes(HTML)).toBe("markup")
    expect(sniffBytes(bytes("  \n<svg onload=alert(1)>"))).toBe("markup")
    expect(sniffBytes(bytes([0xef, 0xbb, 0xbf], "<html>"))).toBe("markup") // BOM first
  })

  it("reports empty and unrecognised binaries", () => {
    expect(sniffBytes(new Uint8Array(0))).toBe("empty")
    expect(sniffBytes(bytes([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]))).toBe("unknown") // .exe
  })
})

describe("inspectUpload", () => {
  it("accepts each format and derives the Content-Type from the bytes", () => {
    const cases: [string, Uint8Array, string][] = [
      ["blueprint.pdf", PDF, "application/pdf"],
      [
        "minutes.docx",
        docx,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      [
        "budget.xlsx",
        xlsx,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      [
        "pitch.pptx",
        pptx,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ],
      ["budget.csv", CSV, "text/csv"],
      ["notes.txt", TXT, "text/plain"],
      ["logo.png", PNG, "image/png"],
      ["team.JPG", JPEG, "image/jpeg"],
      ["team.jpeg", JPEG, "image/jpeg"],
      ["banner.gif", GIF, "image/gif"],
      ["hero.webp", WEBP, "image/webp"],
    ]
    for (const [fileName, content, contentType] of cases) {
      const verdict = inspectUpload({ fileName, bytes: content })
      expect(verdict).toEqual(expect.objectContaining({ ok: true, contentType }))
    }
  })

  it("rejects HTML wearing a .pdf name, and says so", () => {
    // The classic mismatched pair: bytes are HTML, the claim is application/pdf.
    // The claim never reaches this function — the .pdf name is all it sees.
    const verdict = inspectUpload({ fileName: "invoice.pdf", bytes: HTML })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.reason).toContain("invoice.pdf")
    expect(verdict.reason).toContain("not a PDF")
    expect(verdict.reason).toContain("HTML or XML markup")
  })

  it("rejects an ordinary zip renamed to .docx", () => {
    const verdict = inspectUpload({ fileName: "agenda.docx", bytes: plainZip })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.reason).toContain("agenda.docx")
    expect(verdict.reason).toContain("ZIP archive")
  })

  it("does not let one OOXML format pass as another", () => {
    expect(inspectUpload({ fileName: "budget.xlsx", bytes: docx }).ok).toBe(false)
    expect(inspectUpload({ fileName: "minutes.docx", bytes: xlsx }).ok).toBe(false)
  })

  it("rejects markup even when it is honestly named .txt", () => {
    // A .txt that starts with "<" is sniffed as HTML by browsers, which is the
    // whole primitive — the honest extension does not make it safe.
    const verdict = inspectUpload({ fileName: "readme.txt", bytes: HTML })
    expect(verdict.ok).toBe(false)
  })

  it("rejects an empty file by name", () => {
    const verdict = inspectUpload({ fileName: "blank.pdf", bytes: new Uint8Array(0) })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.reason).toContain("blank.pdf")
    expect(verdict.reason).toContain("empty")
  })

  it("rejects extensions outside the allowlist before it ever sniffs", () => {
    const verdict = inspectUpload({ fileName: "payload.svg", bytes: bytes("<svg/>") })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.reason).toContain("payload.svg")
    expect(verdict.reason).toContain(ACCEPTED_UPLOADS_SUMMARY)
    expect(inspectUpload({ fileName: "no-extension", bytes: PDF }).ok).toBe(false)
  })

  it("enforces the size ceiling and names the file that busted it", () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1)
    big.set(PDF)
    const verdict = inspectUpload({ fileName: "huge.pdf", bytes: big })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.reason).toContain("huge.pdf")
    expect(verdict.reason).toContain("15.0 MB")
    expect(verdict.reason).toContain("the limit is 15 MB")
    // A smaller per-surface limit is honoured too.
    expect(inspectUpload({ fileName: "ok.pdf", bytes: PDF, maxBytes: 4 }).ok).toBe(false)
  })

  it("narrows to the accept set a surface actually takes", () => {
    // An avatar upload takes images and nothing else, however real the bytes are.
    expect(inspectUpload({ fileName: "me.png", bytes: PNG, accept: ACCEPT_IMAGE }).ok).toBe(true)
    const verdict = inspectUpload({ fileName: "cv.pdf", bytes: PDF, accept: ACCEPT_IMAGE })
    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.reason).toContain("cv.pdf")
    expect(verdict.reason).toContain(ACCEPT_IMAGE.summary)
    expect(acceptAttribute(ACCEPT_IMAGE)).toBe(".png,.jpg,.jpeg,.gif,.webp")
  })
})

describe("inspectUploads (one request, many files)", () => {
  it("accepts a mixed batch and keeps each file's derived type in order", () => {
    const verdict = inspectUploads([
      { fileName: "minutes.pdf", bytes: PDF },
      { fileName: "logo.png", bytes: PNG },
      { fileName: "budget.csv", bytes: CSV },
    ])
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) throw new Error("unreachable")
    expect(verdict.accepted.map((a) => a.contentType)).toEqual([
      "application/pdf",
      "image/png",
      "text/csv",
    ])
    expect(verdict.accepted.map((a) => a.index)).toEqual([0, 1, 2])
  })

  it("refuses the whole batch when one file is bad, naming that file", () => {
    const verdict = inspectUploads([
      { fileName: "minutes.pdf", bytes: PDF },
      { fileName: "invoice.pdf", bytes: HTML },
    ])
    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.reason).toContain("invoice.pdf")
    expect(verdict.reason).toContain("not a PDF")
  })

  it("caps the file count", () => {
    const many = Array.from({ length: MAX_FILES_PER_REQUEST + 1 }, (_, i) => ({
      fileName: `page-${i}.pdf`,
      bytes: PDF,
    }))
    const verdict = inspectUploads(many)
    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.reason).toContain("up to 10 files")
  })

  it("caps the request total, not just each file", () => {
    // Each file clears the per-file ceiling; together they exceed the transport
    // cap, which is the case that used to fail as an opaque 413.
    const half = new Uint8Array(MAX_UPLOAD_BYTES * 0.6)
    half.set(PDF)
    const verdict = inspectUploads([
      { fileName: "a.pdf", bytes: half },
      { fileName: "b.pdf", bytes: half },
    ])
    expect(verdict.ok).toBe(false)
    if (verdict.ok) throw new Error("unreachable")
    expect(verdict.reason).toContain("one message can carry 15 MB")
  })
})

describe("serving", () => {
  it("only emits Content-Types from the allowlist", () => {
    expect(safeServedContentType("application/pdf")).toBe("application/pdf")
    expect(safeServedContentType("image/png")).toBe("image/png")
    // Legacy rows carry whatever the client claimed at upload time.
    expect(safeServedContentType("text/html")).toBe("application/octet-stream")
    expect(safeServedContentType("image/svg+xml")).toBe("application/octet-stream")
    expect(safeServedContentType(null)).toBe("application/octet-stream")
  })

  it("builds an injection-proof download disposition", () => {
    expect(contentDispositionAttachment("budget.xlsx")).toBe(
      `attachment; filename="budget.xlsx"; filename*=UTF-8''budget.xlsx`
    )
    const nasty = contentDispositionAttachment('a"\r\nX-Evil: 1.pdf')
    // No raw CR/LF survives — that is the header-injection primitive — and the
    // only quotes left are the two delimiting the fallback filename.
    expect(nasty).not.toMatch(/[\r\n]/)
    expect(nasty.match(/"/g)).toHaveLength(2)
    expect(nasty.split(";")[1]).toBe(` filename="a_X-Evil_ 1.pdf"`)
    expect(contentDispositionAttachment("réunion (1).pdf")).toContain(
      "filename*=UTF-8''r%C3%A9union%20%281%29.pdf"
    )
  })

  it("derives a type for keyed objects that have no mimeType column", () => {
    // Avatars and club logos are stored as `…/<timestamp>.<ext>`, where the ext
    // came from the accepted verdict rather than from the uploader.
    expect(safeContentTypeForKey("profile-images/u1/1730000000.png")).toBe("image/png")
    expect(safeContentTypeForKey("org-images/o1/1730000000.webp")).toBe("image/webp")
    // Legacy keys from before validation could carry anything.
    expect(safeContentTypeForKey("org-images/o1/1730000000.img")).toBe("application/octet-stream")
    expect(safeContentTypeForKey("org-images/o1/nodots")).toBe("application/octet-stream")
  })

  it("grants `inline` only to types the allowlist vouches for", () => {
    expect(isInlineSafeContentType("application/pdf")).toBe(true)
    expect(isInlineSafeContentType("image/jpeg")).toBe(true)
    expect(isInlineSafeContentType("text/plain")).toBe(true)
    expect(isInlineSafeContentType("text/html")).toBe(false)
    expect(isInlineSafeContentType("image/svg+xml")).toBe(false)
    expect(isInlineSafeContentType("application/octet-stream")).toBe(false)
  })
})

describe("the allowlist and the accept attribute agree", () => {
  it("offers every accepted extension to the file picker", () => {
    const offered = UPLOAD_ACCEPT_ATTRIBUTE.split(",")
    expect(offered).toContain(".pdf")
    expect(offered).toContain(".docx")
    expect(offered).toContain(".webp")
    expect(offered).not.toContain(".svg")
    for (const ext of offered) {
      // Every offered extension is known to the allowlist — so HTML bytes under
      // that name are refused for what they ARE, not as an unknown type. Not one
      // of the offered formats admits markup.
      const verdict = inspectUpload({ fileName: `x${ext}`, bytes: HTML })
      expect(verdict.ok).toBe(false)
      if (verdict.ok) throw new Error("unreachable")
      expect(verdict.reason).not.toContain("not a file type Tenure accepts")
      expect(fileExtension(`x${ext}`)).toBe(ext.slice(1))
    }
  })
})
