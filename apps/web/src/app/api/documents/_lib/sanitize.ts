/**
 * Strict allowlist sanitizer for document-derived HTML.
 *
 * WHY this exists: any active club member can upload a .docx. content.ts hands
 * it to mammoth and DocContentView renders the result with
 * dangerouslySetInnerHTML, so before this module the uploader chose markup that
 * ran in the app origin for every later viewer. mammoth escapes text runs, but
 * it copies hyperlink targets and embedded-image data URIs through verbatim,
 * and a hand-assembled .docx can carry raw markup that no style map intended —
 * so "mammoth escapes text" is not a control, it is a coincidence.
 *
 * WHY sanitize-html and not DOMPurify: this pass runs server-side in the Node
 * runtime. DOMPurify needs a DOM, which on the server means jsdom — a
 * devDependency here (it arrives with jest-environment-jsdom), an order of
 * magnitude heavier, and a second parser to keep patched. sanitize-html parses
 * with htmlparser2, needs no DOM, and neither it nor its parser chain is
 * flagged: `npm audit` reports the same pre-existing findings with and without
 * it, and the npm advisory database returns nothing for sanitize-html 2.17.6 or
 * htmlparser2 12. Its ESM-only parser chain is why next.config.ts lists these
 * packages in `transpilePackages` — see the note there.
 *
 * WHY it lives beside content.ts under _lib: same containment rule stated
 * there — heavy parsers must stay where no client bundle can reach them. The
 * policy itself (`sanitizeAttributes`, `sanitizeUrl`) is pure and exported so
 * the allowlist is unit-tested directly rather than only through a .docx.
 */
import sanitizeHtmlLib from "sanitize-html"

/**
 * Structure, inline formatting, links and images. Everything else — script,
 * style, iframe, object, embed, svg, form controls — is absent by omission.
 */
export const ALLOWED_TAGS = [
  // Structure
  "p", "br", "hr", "div", "span",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd",
  "blockquote", "pre", "code",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  // Inline formatting
  "b", "strong", "i", "em", "u", "s", "strike", "del", "ins",
  "sub", "sup", "small", "mark", "abbr", "cite", "q",
  // Links and images
  "a", "img", "figure", "figcaption",
]

/**
 * Tags whose *text* is discarded along with the tag. Dropping `<script>` while
 * keeping its body would turn `alert(1)` into visible page text; worse,
 * `<style>` bodies leak into the layout. sanitize-html defaults to
 * script/style/textarea/option — the rest are added because a converted
 * document has no legitimate text inside them either.
 */
export const DROP_CONTENT_TAGS = [
  "script", "style", "noscript", "template",
  "iframe", "frame", "frameset", "object", "embed", "applet",
  "svg", "math",
  "head", "title", "meta", "link", "base",
  "form", "input", "button", "select", "textarea", "option",
]

/**
 * Attributes that survive the transform below. This is belt-and-braces:
 * `sanitizeAttributes` rebuilds the attribute set from scratch, so an event
 * handler never reaches this list in the first place.
 */
export const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  // `title` is inert tooltip text and carries a document's real annotations.
  "*": ["id", "title"],
  a: ["href", "target", "rel"],
  img: ["src", "alt", "width", "height"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  col: ["span"],
  colgroup: ["span"],
  ol: ["start"],
}

/** Schemes a link may navigate to. */
const HREF_SCHEMES = new Set(["http", "https", "mailto", "tel"])

/** Schemes an image may load from, before the data: payload check. */
const SRC_SCHEMES = new Set(["http", "https"])

/**
 * The only data: payloads that survive. Anchored and base64-only: a bare
 * `data:image/png,<raw>` can carry markup that a sniffing browser may run, and
 * mammoth only ever emits base64.
 */
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/i

/** `<scheme>:` at the start of a URL, per RFC 3986. `//host`, `/path`, `#frag` do not match. */
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/

/**
 * Namespace applied to every surviving `id` and same-document fragment link.
 * An uploaded document that sets `id="body"` or `id="attributes"` clobbers the
 * matching property on `document`/`window`, which is how a sanitized page still
 * breaks the script around it. Prefixing kills the collision while keeping
 * mammoth's footnote anchors (`#footnote-1` → `#doc-footnote-1`) working, since
 * both ends of the pair go through the same prefix.
 */
export const ID_PREFIX = "doc-"

export type UrlDecision = { url: string; external: boolean } | null

/**
 * Decide what a single URL attribute is allowed to become. Returns null when the
 * attribute must be dropped entirely.
 *
 * `external` drives target/rel: it is true only for a URL that leaves this
 * origin (absolute http(s), or protocol-relative). Relative paths, fragments,
 * mailto: and tel: are not opened in a new tab.
 */
export function sanitizeUrl(raw: string, kind: "href" | "src"): UrlDecision {
  // Browsers strip TAB/LF/CR anywhere in a URL *before* resolving the scheme, so
  // `jav&#9;ascript:alert(1)` — which the HTML parser has already decoded to a
  // literal tab by the time we see it — is a live javascript: URL. No legal URL
  // carries a raw control character (they must be percent-encoded), so removing
  // the whole C0 range is safe and closes the family rather than one member.
  const url = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim()
  if (!url) return null

  const scheme = SCHEME.exec(url)?.[1].toLowerCase()

  if (scheme === undefined) {
    // Protocol-relative: resolves to this page's scheme against another host.
    if (url.startsWith("//")) return { url, external: true }
    // Relative path or same-document fragment — same origin by construction.
    return { url, external: false }
  }

  // data: images are permitted only where an image is expected. As an href it
  // would be a navigation to attacker-chosen bytes for no legitimate gain.
  if (scheme === "data") {
    return kind === "src" && DATA_IMAGE.test(url) ? { url, external: false } : null
  }

  const allowed = kind === "href" ? HREF_SCHEMES : SRC_SCHEMES
  if (!allowed.has(scheme)) return null

  return { url, external: scheme === "http" || scheme === "https" }
}

/** Prefix an id, and strip the whitespace HTML ids may not contain. */
function namespaceId(raw: string): string | null {
  const id = raw.replace(/\s+/g, "")
  return id ? ID_PREFIX + id : null
}

/**
 * Rebuild a tag's attributes from an allowlist. Nothing is copied through: the
 * output is constructed key by key, so `onerror`, `onload`, `style`, `srcset`,
 * `formaction` and every attribute invented after this was written are dropped
 * because they were never added, not because they were matched.
 */
export function sanitizeAttributes(
  tagName: string,
  attribs: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {}

  const id = attribs.id ? namespaceId(attribs.id) : null
  if (id) out.id = id
  if (attribs.title) out.title = attribs.title

  switch (tagName) {
    case "a": {
      const href = sanitizeUrl(attribs.href ?? "", "href")
      if (href) {
        // Same-document links point at ids this pass has just renamed. A bare
        // "#" names no id — it means top-of-page, so it is left alone rather
        // than turned into a dangling "#doc-".
        out.href =
          href.url.length > 1 && href.url.startsWith("#")
            ? "#" + ID_PREFIX + href.url.slice(1)
            : href.url
        if (href.external) {
          out.target = "_blank"
          out.rel = "noopener noreferrer"
        }
      }
      // A dropped href leaves the anchor's text visible rather than deleting
      // the sentence it sits in.
      break
    }
    case "img": {
      const src = sanitizeUrl(attribs.src ?? "", "src")
      if (src) out.src = src.url
      if (attribs.alt) out.alt = attribs.alt
      copyDigits(attribs, out, "width")
      copyDigits(attribs, out, "height")
      break
    }
    case "td":
    case "th":
      copyDigits(attribs, out, "colspan")
      copyDigits(attribs, out, "rowspan")
      if (tagName === "th" && (attribs.scope === "row" || attribs.scope === "col")) {
        out.scope = attribs.scope
      }
      break
    case "col":
    case "colgroup":
      copyDigits(attribs, out, "span")
      break
    case "ol":
      copyDigits(attribs, out, "start")
      break
  }

  return out
}

/** Copy a numeric layout attribute only when it really is a number. */
function copyDigits(
  attribs: Record<string, string>,
  out: Record<string, string>,
  name: string
): void {
  const value = attribs[name]
  if (value && /^\d{1,6}$/.test(value)) out[name] = value
}

/**
 * Sanitize converted-document HTML. Deterministic and side-effect free: call it
 * on every string that is about to become `{ kind: "html" }`.
 */
export function sanitizeDocumentHtml(html: string): string {
  if (!html) return ""
  return sanitizeHtmlLib(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    nonTextTags: DROP_CONTENT_TAGS,
    // '*' rather than per-tag entries: sanitize-html picks the tag-specific
    // transform *or* the wildcard, never both, so one entry keeps the id and
    // URL policy from being silently skipped for <a> and <img>.
    transformTags: {
      "*": (tagName, attribs) => ({ tagName, attribs: sanitizeAttributes(tagName, attribs) }),
    },
    // A second, independent scheme check behind sanitizeUrl.
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: true,
    allowedClasses: {},
    disallowedTagsMode: "discard",
  })
}
