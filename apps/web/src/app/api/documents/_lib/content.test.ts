/**
 * The sanitizer is unit-tested next door; what this file guards is the *wiring*
 * — that `buildDocContent` is the single producer of `{ kind: "html" }` and that
 * it never emits a conversion the sanitizer has not seen. Delete the
 * `sanitizeDocumentHtml` call in content.ts and sanitize.test.ts still passes;
 * this suite does not.
 *
 * It also pins the claim that the *other* converted formats need no sanitizer:
 * sheets / text / pptx carry data, not markup, and DocContentView renders them
 * as React text nodes, which escape by construction. The assertions here are
 * that those kinds stay plain data — if one ever starts carrying HTML, it must
 * come back through the sanitizer too.
 *
 * S3 is mocked because the parse path, not the transport, is under test.
 */
const bytes = { current: Buffer.alloc(0) }

jest.mock("@/lib/s3", () => ({
  documentsBucket: "test-bucket",
  documentViewUrl: jest.fn(async (key: string) => `https://signed.example/${key}`),
  getDocumentBytes: jest.fn(async () => bytes.current),
}))

jest.mock("mammoth", () => ({ __esModule: true, default: { convertToHtml: jest.fn() } }))

import mammoth from "mammoth"
import { buildDocContent } from "./content"

const convertToHtml = mammoth.convertToHtml as unknown as jest.Mock

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

/** Narrow the DocContent union to the html case, failing loudly if it is not. */
async function htmlFor(converted: string): Promise<string> {
  convertToHtml.mockResolvedValueOnce({ value: converted, messages: [] })
  const content = await buildDocContent({ objectKey: "k", mime: DOCX, sizeBytes: 1000 })
  if (content.kind !== "html") throw new Error(`expected html, got ${content.kind}`)
  return content.html
}

describe("buildDocContent — .docx", () => {
  beforeEach(() => {
    bytes.current = Buffer.from("docx bytes")
    convertToHtml.mockReset()
  })

  it("sanitizes what mammoth produces before it becomes renderable content", async () => {
    // mammoth escapes text runs, but it copies hyperlink targets through
    // verbatim and a hand-assembled .docx can carry raw markup no style map
    // intended — so the conversion is attacker-influenced, not trusted.
    const html = await htmlFor(
      `<p>Minutes</p><script>alert(1)</script>` +
        `<img src="x" onerror="alert(1)">` +
        `<a href="javascript:alert(1)">link</a>`
    )
    expect(html).toBe('<p>Minutes</p><img src="x" /><a>link</a>')
  })

  it("hardens external links the document carries", async () => {
    expect(await htmlFor('<a href="https://example.com">Policy</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Policy</a>'
    )
  })

  it("leaves an ordinary document alone", async () => {
    const doc = "<h1>Agenda</h1><p>Item <strong>one</strong>.</p>"
    expect(await htmlFor(doc)).toBe(doc)
  })

  it("degrades to unsupported rather than throwing when conversion fails", async () => {
    convertToHtml.mockRejectedValueOnce(new Error("not a zip"))
    const content = await buildDocContent({ objectKey: "k", mime: DOCX, sizeBytes: 1000 })
    expect(content.kind).toBe("unsupported")
  })
})

describe("buildDocContent — the other converted formats carry data, not markup", () => {
  beforeEach(() => convertToHtml.mockReset())

  it("returns text verbatim, for a renderer that escapes it", async () => {
    bytes.current = Buffer.from('{"note":"<script>alert(1)</script>"}')
    const content = await buildDocContent({
      objectKey: "k",
      mime: "application/json",
      sizeBytes: 40,
    })
    // Deliberately NOT sanitized: DocContentView renders this inside <pre>{…}</pre>,
    // where React escapes it. Sanitizing here would corrupt legitimate source
    // files, which is the whole point of a text preview.
    expect(content).toEqual({ kind: "text", text: '{"note":"<script>alert(1)</script>"}' })
  })

  it("returns spreadsheet cells as plain values", async () => {
    bytes.current = Buffer.from("a,<script>alert(1)</script>\n1,2\n")
    const content = await buildDocContent({ objectKey: "k", mime: "text/csv", sizeBytes: 40 })
    if (content.kind !== "sheets") throw new Error(`expected sheets, got ${content.kind}`)
    // Cells are strings/numbers rendered into <td>{cell}</td> — no html field
    // exists on this kind, so there is no injection sink to close.
    for (const sheet of content.sheets) {
      for (const row of sheet.rows) {
        for (const cell of row) {
          expect(["string", "number", "object"]).toContain(typeof cell)
        }
      }
    }
  })

  it("never produces the html kind for a format other than .docx", async () => {
    for (const mime of ["text/plain", "text/csv", "application/json", "application/zip"]) {
      bytes.current = Buffer.from("<script>alert(1)</script>")
      const content = await buildDocContent({ objectKey: "k", mime, sizeBytes: 25 })
      expect(content.kind).not.toBe("html")
    }
  })
})
