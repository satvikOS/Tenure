/**
 * The sanitizer against real mammoth output, not a hand-written approximation.
 *
 * sanitize.test.ts asserts the policy against HTML strings, and content.test.ts
 * asserts the wiring with mammoth mocked. Both are necessary and neither covers
 * the thing that actually failed: what mammoth emits from a hostile .docx, and
 * whether that specific shape survives the allowlist. The vulnerability was
 * demonstrated by converting a real document and finding
 * `<a href="javascript:…">` reaching `dangerouslySetInnerHTML`, so the
 * regression test has to convert a real document too.
 *
 * A .docx is a zip of OOXML parts. This builds the minimum mammoth will parse:
 * the content-type map, the package relationship pointing at the document, the
 * document body, and the document's own relationships — which is where an
 * external hyperlink's target lives, and therefore where the payload goes.
 */
// Storage is mocked because the transport is not under test. mammoth is
// deliberately NOT mocked — its real output is the subject.
const bytes: { current: Buffer } = { current: Buffer.alloc(0) }

jest.mock("@/lib/s3", () => ({
  documentsBucket: "test-bucket",
  documentViewUrl: jest.fn(async (key: string) => `https://signed.example/${key}`),
  getDocumentBytes: jest.fn(async () => bytes.current),
}))

import JSZip from "jszip"
import { buildDocContent } from "./content"

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const PACKAGE_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

/** Hyperlink targets live in the document's relationship part, not in the body. */
function documentRels(targets: string[]): string {
  const rels = targets
    .map(
      (t, i) =>
        `<Relationship Id="link${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${t.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" TargetMode="External"/>`,
    )
    .join("")
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
}

function paragraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
}

function linkParagraph(id: string, text: string): string {
  return `<w:p><w:hyperlink r:id="${id}"><w:r><w:t>${text}</w:t></w:r></w:hyperlink></w:p>`
}

async function docx(body: string, linkTargets: string[] = []): Promise<Buffer> {
  const zip = new JSZip()
  zip.file("[Content_Types].xml", CONTENT_TYPES)
  zip.folder("_rels")!.file(".rels", PACKAGE_RELS)
  const word = zip.folder("word")!
  word.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${body}</w:body>
</w:document>`,
  )
  word.folder("_rels")!.file("document.xml.rels", documentRels(linkTargets))
  // JSZip types the result as Buffer<ArrayBufferLike>; copy into a plain
  // Buffer so the mocked getDocumentBytes keeps the signature it replaces.
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }))
}

async function convert(buf: Buffer): Promise<string> {
  bytes.current = buf
  const content = await buildDocContent({
    objectKey: "documents/hostile.docx",
    mime: DOCX_MIME,
    sizeBytes: buf.length,
  })
  if (content.kind !== "html") {
    throw new Error(`Expected html content from a .docx, got "${content.kind}".`)
  }
  return content.html
}

describe("real mammoth output is sanitized before it reaches the viewer", () => {
  it("strips a javascript: hyperlink while keeping the link text", async () => {
    const html = await convert(
      await docx(linkParagraph("link0", "Click for the budget"), [
        "javascript:alert(document.domain)",
      ]),
    )
    expect(html).not.toMatch(/javascript:/i)
    // The document's visible content survives — sanitizing is not deleting.
    expect(html).toContain("Click for the budget")
  })

  it("does not reassemble a script tag typed as document text", async () => {
    const html = await convert(await docx(paragraph("&lt;script&gt;alert(1)&lt;/script&gt;")))
    expect(html).not.toMatch(/<script/i)
  })

  it("drops a vbscript: target", async () => {
    const html = await convert(await docx(linkParagraph("link0", "Invoice"), ["vbscript:msgbox(1)"]))
    expect(html).not.toMatch(/vbscript:/i)
    expect(html).toContain("Invoice")
  })

  it("keeps an ordinary external link and makes it safe to open", async () => {
    const html = await convert(
      await docx(linkParagraph("link0", "The policy"), ["https://example.com/policy"]),
    )
    expect(html).toContain("https://example.com/policy")
    expect(html).toMatch(/rel="[^"]*noopener/)
    expect(html).toMatch(/rel="[^"]*noreferrer/)
  })

  it("emits no event-handler attribute for any of these documents", async () => {
    const bodies = [
      await docx(linkParagraph("link0", "a"), ["javascript:alert(1)"]),
      await docx(paragraph("&lt;img src=x onerror=alert(1)&gt;")),
      await docx(paragraph("&lt;svg onload=alert(1)&gt;&lt;/svg&gt;")),
    ]
    for (const buf of bodies) {
      const html = await convert(buf)
      // Inside a tag, not anywhere in the string. A document whose *text* reads
      // "onerror=alert(1)" is not a vulnerability — it is a sentence, and it
      // stays a sentence because it is escaped. Asserting on the bare substring
      // fails on safe output and would have been "fixed" by weakening the
      // sanitizer.
      expect(html).not.toMatch(/<[^>]+\son\w+\s*=/i)
    }
  })

  it("leaves markup typed as text escaped, rather than deleting it", async () => {
    // The other half of the assertion above: the payload survives as readable
    // content. Sanitizing a document must not silently eat what it says.
    const html = await convert(await docx(paragraph("&lt;img src=x onerror=alert(1)&gt;")))
    expect(html).toMatch(/&lt;img/i)
    expect(html).not.toMatch(/<img/i)
  })
})
