/**
 * The allowlist is the only thing standing between an uploaded .docx and
 * `dangerouslySetInnerHTML`, so it is tested against real payloads rather than
 * against the shape of the config object. Two halves:
 *
 *  - the attack corpus, which must never produce an executable artefact;
 *  - the fidelity corpus, which must survive byte-for-byte, because a sanitizer
 *    that eats ordinary documents gets turned off.
 */
import {
  ALLOWED_ATTRIBUTES,
  ALLOWED_TAGS,
  ID_PREFIX,
  sanitizeAttributes,
  sanitizeDocumentHtml,
  sanitizeUrl,
} from "./sanitize"

/**
 * Substrings that must not appear in any sanitized output. Checked on every
 * attack case in addition to that case's own assertion, so a payload that gets
 * neutralised in one place but re-serialised in another still fails.
 */
const FORBIDDEN = [
  "<script",
  "<iframe",
  "<svg",
  "<object",
  "<embed",
  "<style",
  "<form",
  "javascript:",
  "vbscript:",
  "onerror",
  "onload",
  "onclick",
  "onstart",
  "srcdoc",
  "formaction",
]

function expectInert(html: string): string {
  const out = sanitizeDocumentHtml(html)
  const lower = out.toLowerCase()
  for (const needle of FORBIDDEN) {
    expect(lower).not.toContain(needle)
  }
  return out
}

describe("sanitizeUrl", () => {
  it("passes the schemes a document legitimately links to", () => {
    expect(sanitizeUrl("https://example.com/a", "href")).toEqual({
      url: "https://example.com/a",
      external: true,
    })
    expect(sanitizeUrl("http://example.com/a", "href")).toEqual({
      url: "http://example.com/a",
      external: true,
    })
    expect(sanitizeUrl("mailto:a@b.com", "href")).toEqual({
      url: "mailto:a@b.com",
      external: false,
    })
    expect(sanitizeUrl("tel:+15551234", "href")).toEqual({
      url: "tel:+15551234",
      external: false,
    })
  })

  it("treats relative paths and fragments as same-origin", () => {
    expect(sanitizeUrl("/orgs/acme/documents", "href")).toEqual({
      url: "/orgs/acme/documents",
      external: false,
    })
    expect(sanitizeUrl("#footnote-1", "href")).toEqual({ url: "#footnote-1", external: false })
  })

  it("treats a protocol-relative URL as external — it leaves this origin", () => {
    expect(sanitizeUrl("//evil.example/x", "href")).toEqual({
      url: "//evil.example/x",
      external: true,
    })
  })

  it("rejects script-bearing schemes however they are spelled", () => {
    expect(sanitizeUrl("javascript:alert(1)", "href")).toBeNull()
    expect(sanitizeUrl("JaVaScRiPt:alert(1)", "href")).toBeNull()
    expect(sanitizeUrl("   javascript:alert(1)", "href")).toBeNull()
    expect(sanitizeUrl("vbscript:msgbox(1)", "href")).toBeNull()
    expect(sanitizeUrl("VBScript:msgbox(1)", "href")).toBeNull()
    // The HTML parser decodes `jav&#9;ascript:` to a literal TAB before we see
    // it, and browsers strip TAB/LF/CR from a URL before resolving the scheme.
    expect(sanitizeUrl("jav\tascript:alert(1)", "href")).toBeNull()
    expect(sanitizeUrl("java\nscript:alert(1)", "href")).toBeNull()
    expect(sanitizeUrl("java\rscript:alert(1)", "href")).toBeNull()
    expect(sanitizeUrl("java\0script:alert(1)", "href")).toBeNull()
  })

  it("rejects other navigable schemes that are not on the list", () => {
    expect(sanitizeUrl("file:///etc/passwd", "href")).toBeNull()
    expect(sanitizeUrl("ftp://example.com/x", "href")).toBeNull()
    expect(sanitizeUrl("blob:https://example.com/abc", "src")).toBeNull()
  })

  it("allows only base64 raster data: URIs, and only as an image source", () => {
    for (const type of ["png", "jpeg", "gif", "webp"]) {
      const url = `data:image/${type};base64,iVBORw0KGgo=`
      expect(sanitizeUrl(url, "src")).toEqual({ url, external: false })
      // The same bytes as a navigation target have no legitimate use.
      expect(sanitizeUrl(url, "href")).toBeNull()
    }
    expect(sanitizeUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "src")).toBeNull()
    expect(sanitizeUrl("data:text/html;base64,PHNjcmlwdD4=", "src")).toBeNull()
    // Not base64: a raw payload can carry markup a sniffing browser may run.
    expect(sanitizeUrl("data:image/png,%3Cscript%3E", "src")).toBeNull()
  })

  it("rejects an empty or whitespace-only URL", () => {
    expect(sanitizeUrl("", "href")).toBeNull()
    expect(sanitizeUrl("   ", "href")).toBeNull()
  })
})

describe("sanitizeAttributes", () => {
  it("rebuilds the attribute set, so unknown attributes are never copied", () => {
    expect(
      sanitizeAttributes("img", {
        src: "https://cdn.example/a.png",
        alt: "A",
        onerror: "alert(1)",
        onload: "alert(2)",
        srcset: "evil.example/x 1x",
        style: "position:fixed;inset:0",
        "data-anything": "x",
      })
    ).toEqual({ src: "https://cdn.example/a.png", alt: "A" })
  })

  it("forces target and rel on external links and overrides what the document asked for", () => {
    expect(
      sanitizeAttributes("a", {
        href: "https://example.com/doc",
        target: "_self",
        rel: "opener",
        onclick: "alert(1)",
      })
    ).toEqual({
      href: "https://example.com/doc",
      target: "_blank",
      rel: "noopener noreferrer",
    })
  })

  it("does not open same-origin, mailto or tel links in a new tab", () => {
    expect(sanitizeAttributes("a", { href: "/orgs/acme" })).toEqual({ href: "/orgs/acme" })
    expect(sanitizeAttributes("a", { href: "mailto:a@b.com" })).toEqual({
      href: "mailto:a@b.com",
    })
  })

  it("drops a rejected href but keeps the anchor, so the sentence survives", () => {
    expect(sanitizeAttributes("a", { href: "javascript:alert(1)" })).toEqual({})
  })

  it("namespaces ids and both ends of a same-document link together", () => {
    expect(sanitizeAttributes("p", { id: "footnote-1" })).toEqual({ id: `${ID_PREFIX}footnote-1` })
    expect(sanitizeAttributes("a", { href: "#footnote-1" })).toEqual({
      href: `#${ID_PREFIX}footnote-1`,
    })
    // An uploaded id="body" would otherwise clobber document.body for scripts
    // running on the same page.
    expect(sanitizeAttributes("p", { id: "body" })).toEqual({ id: `${ID_PREFIX}body` })
    // A bare "#" names no id — it means top of page.
    expect(sanitizeAttributes("a", { href: "#" })).toEqual({ href: "#" })
  })

  it("keeps layout numbers only when they really are numbers", () => {
    expect(sanitizeAttributes("td", { colspan: "2", rowspan: "3" })).toEqual({
      colspan: "2",
      rowspan: "3",
    })
    expect(sanitizeAttributes("td", { colspan: "2); alert(1" })).toEqual({})
    expect(sanitizeAttributes("th", { scope: "col" })).toEqual({ scope: "col" })
    expect(sanitizeAttributes("th", { scope: "javascript:alert(1)" })).toEqual({})
  })
})

describe("sanitizeDocumentHtml — attack corpus", () => {
  it("removes a script element and its body", () => {
    expect(expectInert(`<p>before</p><script>alert(1)</script><p>after</p>`)).toBe(
      "<p>before</p><p>after</p>"
    )
  })

  it("removes an inline event handler while keeping the element", () => {
    expect(expectInert(`<img src="https://cdn.example/a.png" onerror="alert(1)">`)).toBe(
      '<img src="https://cdn.example/a.png" />'
    )
    expect(expectInert(`<p onmouseover="alert(1)">hover</p>`)).toBe("<p>hover</p>")
    expect(
      expectInert(`<a href="https://example.com" onclick="alert(1)">x</a>`)
    ).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>')
  })

  it("strips a javascript: href but leaves the link text readable", () => {
    expect(expectInert(`<a href="javascript:alert(1)">Click me</a>`)).toBe("<a>Click me</a>")
    expect(expectInert(`<a href="JAVASCRIPT:alert(1)">Click me</a>`)).toBe("<a>Click me</a>")
    expect(expectInert(`<a href="vbscript:msgbox(1)">Click me</a>`)).toBe("<a>Click me</a>")
  })

  it("closes the encoded-scheme variants that decode to javascript:", () => {
    // Both decode to a live javascript: URL before the browser resolves it.
    expect(expectInert(`<a href="&#106;avascript:alert(1)">x</a>`)).toBe("<a>x</a>")
    expect(expectInert(`<a href="jav&#x09;ascript:alert(1)">x</a>`)).toBe("<a>x</a>")
    expect(expectInert(`<a href="jav&#10;ascript:alert(1)">x</a>`)).toBe("<a>x</a>")
  })

  it("does not reassemble a nested/split script tag", () => {
    // The parser sees `<scr` as text and `<script>` as a tag; the danger is a
    // sanitizer that deletes the inner tag and lets the halves rejoin.
    const out = expectInert(`<scr<script>ipt>alert(1)</script>`)
    expect(out).not.toContain("<scr")
    expect(out).toBe("ipt&gt;alert(1)")
  })

  it("leaves an already-escaped payload escaped rather than decoding it", () => {
    expect(expectInert(`<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>`)).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"
    )
  })

  it("drops an iframe entirely, including a srcdoc payload", () => {
    expect(expectInert(`<iframe src="https://evil.example/x"></iframe>`)).toBe("")
    expect(expectInert(`<iframe srcdoc="<script>alert(1)</script>"></iframe>`)).toBe("")
  })

  it("drops SVG and its onload, rather than unwrapping it into the page", () => {
    expect(expectInert(`<svg onload="alert(1)"><circle r="10"/></svg>`)).toBe("")
    expect(expectInert(`<svg><animate onbegin="alert(1)" attributeName="x"/></svg>`)).toBe("")
    // MathML is the other foreign-content parser with the same mXSS surface.
    expect(expectInert(`<math><mtext><script>alert(1)</script></mtext></math>`)).toBe("")
  })

  it("drops the tags that exist only to execute, navigate or collect", () => {
    expect(expectInert(`<style>body{background:url(javascript:alert(1))}</style><p>ok</p>`)).toBe(
      "<p>ok</p>"
    )
    expect(expectInert(`<base href="https://evil.example/">`)).toBe("")
    expect(expectInert(`<object data="x.swf"></object>`)).toBe("")
    expect(expectInert(`<embed src="x.swf">`)).toBe("")
    expect(
      expectInert(`<form action="https://evil.example"><input name="a"><button>go</button></form>`)
    ).toBe("")
    expect(expectInert(`<button formaction="javascript:alert(1)">x</button>`)).toBe("")
    expect(expectInert(`<noscript><p>hidden</p></noscript>`)).toBe("")
  })

  it("drops a style attribute, which can position an overlay over the app", () => {
    expect(
      expectInert(`<p style="position:fixed;inset:0;background:url(javascript:alert(1))">x</p>`)
    ).toBe("<p>x</p>")
  })

  it("rejects a data: URI that is not a raster image", () => {
    expect(expectInert(`<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">`)).toBe("<img />")
    expect(
      expectInert(`<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>`)
    ).toBe("<a>x</a>")
  })

  it("survives a payload buried several levels down", () => {
    expect(
      expectInert(
        `<div><blockquote><p><a href="javascript:alert(1)"><strong>deep</strong></a></p></blockquote></div>`
      )
    ).toBe("<div><blockquote><p><a><strong>deep</strong></a></p></blockquote></div>")
  })

  it("handles a mixed document without letting any one payload through", () => {
    expect(
      expectInert(
        `<p>Minutes</p><script>fetch("/api/session")</script>` +
          `<img src=x onerror=alert(1)><a href="javascript:void(0)">link</a>` +
          `<iframe src="//evil.example"></iframe><p>End</p>`
      )
    ).toBe('<p>Minutes</p><img src="x" /><a>link</a><p>End</p>')
  })

  it("returns an empty string for empty input rather than throwing", () => {
    expect(sanitizeDocumentHtml("")).toBe("")
    expect(sanitizeDocumentHtml("<p>a<script>alert(1)")).toBe("<p>a</p>")
  })
})

describe("sanitizeDocumentHtml — benign documents survive intact", () => {
  it("keeps headings, inline formatting and lists exactly as converted", () => {
    const html =
      "<h1>Board Minutes</h1>" +
      "<p>The <strong>treasurer</strong> reported a <em>surplus</em>, see <u>note</u>.</p>" +
      "<ul><li>Budget approved</li><li>Elections in May</li></ul>" +
      "<ol start=\"3\"><li>Third item</li></ol>" +
      "<blockquote><p>Quoted text</p></blockquote>" +
      "<pre><code>npm run build</code></pre><hr />"
    expect(sanitizeDocumentHtml(html)).toBe(html)
  })

  it("keeps a full table with spans and scopes", () => {
    const html =
      "<table><caption>Spend</caption>" +
      '<colgroup><col span="2" /></colgroup>' +
      '<thead><tr><th scope="col">Item</th><th scope="col">Cost</th></tr></thead>' +
      '<tbody><tr><td colspan="2">Venue hire</td></tr>' +
      '<tr><td rowspan="2">Catering</td><td>120</td></tr></tbody>' +
      "<tfoot><tr><td>Total</td><td>120</td></tr></tfoot></table>"
    expect(sanitizeDocumentHtml(html)).toBe(html)
  })

  it("keeps an embedded image, which is how mammoth carries .docx pictures", () => {
    expect(
      sanitizeDocumentHtml(
        '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" alt="Logo" width="120" height="80">'
      )
    ).toBe('<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" alt="Logo" width="120" height="80" />')
  })

  it("keeps footnote anchors working by renaming both ends together", () => {
    const out = sanitizeDocumentHtml(
      '<p>Text<a href="#footnote-1" id="footnote-ref-1">1</a></p>' +
        '<li id="footnote-1"><p>The note. <a href="#footnote-ref-1">↑</a></p></li>'
    )
    expect(out).toBe(
      `<p>Text<a id="${ID_PREFIX}footnote-ref-1" href="#${ID_PREFIX}footnote-1">1</a></p>` +
        `<li id="${ID_PREFIX}footnote-1"><p>The note. <a href="#${ID_PREFIX}footnote-ref-1">↑</a></p></li>`
    )
  })

  it("keeps an external link but hardens how it opens", () => {
    expect(sanitizeDocumentHtml('<a href="https://example.com/policy">Policy</a>')).toBe(
      '<a href="https://example.com/policy" target="_blank" rel="noopener noreferrer">Policy</a>'
    )
  })

  it("keeps mailto, tel and in-app links untouched", () => {
    const html =
      '<p><a href="mailto:board@club.example">Email</a> ' +
      '<a href="tel:+15551234567">Call</a> ' +
      '<a href="/orgs/acme/documents">Documents</a></p>'
    expect(sanitizeDocumentHtml(html)).toBe(html)
  })

  it("keeps a figure with its caption", () => {
    const html =
      '<figure><img src="https://cdn.example/chart.png" alt="Chart" /><figcaption>Membership</figcaption></figure>'
    expect(sanitizeDocumentHtml(html)).toBe(html)
  })
})

describe("the allowlists themselves", () => {
  it("never lists an executable or navigating container", () => {
    for (const tag of ["script", "style", "iframe", "object", "embed", "svg", "math", "form", "base", "link", "meta"]) {
      expect(ALLOWED_TAGS).not.toContain(tag)
    }
  })

  it("never lists an event handler or a style/srcset attribute", () => {
    for (const attrs of Object.values(ALLOWED_ATTRIBUTES)) {
      for (const attr of attrs) {
        expect(attr.startsWith("on")).toBe(false)
        expect(["style", "srcset", "formaction", "class"]).not.toContain(attr)
      }
    }
  })
})
