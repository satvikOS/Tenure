/**
 * The Content-Security-Policy Tenure serves.
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 * The document preview converts an uploaded DOCX to HTML with mammoth and hands
 * the result straight to `dangerouslySetInnerHTML`
 * (src/components/documents/DocContentView.tsx, fed by
 * src/app/api/documents/_lib/content.ts). Nothing sanitises that string, so a
 * crafted upload is the shortest path in this app to attacker-authored markup
 * rendering inside an authenticated session. CSP is not the fix for that —
 * sanitising is — it is the containment layer that decides how much such an
 * injection is worth once it lands. next.config.ts already sends HSTS, nosniff,
 * frame-deny, referrer and permissions policies; this was the missing one.
 *
 * ── Why report-only first ───────────────────────────────────────────────────
 * An enforcing policy that breaks App Router hydration, a server action or the
 * pre-hydration theme script is worse than no policy at all: the product stops
 * working and the whole header gets reverted. So the policy below ships under
 * `Content-Security-Policy-Report-Only`: browsers evaluate it, log every
 * violation, and block nothing. `CSP_MODE` is the one switch to flip once the
 * checklist on it has actually been walked.
 *
 * ── The constraint that shapes every directive below ────────────────────────
 * `headers()` in next.config.ts is evaluated by `next build` and written into
 * .next/routes-manifest.json; the running server never calls it again. The
 * bucket (S3_DOCUMENTS_BUCKET) and the IdP (OKTA_ISSUER) are runtime-only
 * variables on the ECS task and are simply absent from the Docker build stage,
 * so no directive here can be interpolated from them. Where a real host is
 * unavoidable the policy uses a wildcard and says so.
 */

export type CspMode = "report-only" | "enforce"

/** The response header that carries the policy in each mode. */
export const CSP_HEADER_NAME: Record<CspMode, string> = {
  "report-only": "Content-Security-Policy-Report-Only",
  enforce: "Content-Security-Policy",
}

/**
 * ⚠️  THE SWITCH — this is the enforcing-version constant. Changing it to
 * "enforce" is the whole migration; nothing else needs to move.
 *
 * Before switching, verify on a DEPLOYED build (dev is a different policy and a
 * different bundler):
 *
 *   1. Zero report-only violations in the browser console across a real soak:
 *      sign-in (dev-login, and Okta if it is live), dashboard hydration, a
 *      server-action mutation, the document viewer for every preview kind
 *      (pdf, image, docx→html, xlsx→sheets, pptx, text), an image upload, and a
 *      budget import — BudgetUpload parses the workbook with SheetJS in the
 *      browser, so it is the one non-framework library executing client-side
 *      script and the only realistic source of a production 'unsafe-eval'
 *      report.
 *   2. `script-src-attr` reported nothing at all. It is the only directive here
 *      that is stricter than what the app is already known to do, so it is the
 *      one that can break a page nobody opened during the soak.
 *   3. The PDF preview still renders in Chrome, Firefox and Safari. Chrome's
 *      viewer is an internal <embed> inside the iframe; `object-src 'none'`
 *      does not reach it today, but that is browser behaviour, not a promise.
 *   4. Document download and view with JavaScript disabled — or accept that the
 *      no-JS path is unsupported. `downloadDocumentAction` / `viewDocumentAction`
 *      are `<form action={…}>` server actions ending in `redirect()` to a
 *      presigned S3 URL; Chrome applies `form-action` across that
 *      POST → 303 → S3 chain when the form submits natively. With JS on, Next
 *      resolves the action over fetch and the external hop is a location
 *      assignment, which `form-action` does not govern.
 *   5. Whether any club logo or profile image is stored as a plain `http://`
 *      URL. `setOrgImageUrl` accepts both schemes and `img-src` lists no
 *      `http:` source, so those images start being blocked. Check the column
 *      before enforcing, not after.
 *   6. Okta, if configured: the sign-in POST redirects to OKTA_ISSUER, which
 *      `form-action 'self'` does not list and cannot (runtime-only variable).
 *      Either confirm the JS path is the only one users take, or move to a
 *      middleware-built policy that can read the issuer at request time.
 *
 * There is deliberately no `report-uri` / `report-to`. An unauthenticated
 * report collector is a log-flooding target and this pilot has nowhere to ship
 * reports to; violations surface in the browser console, which is what the soak
 * above is for. Silence from a policy with no collector is not evidence — add
 * one before treating it as such.
 */
export const CSP_MODE: CspMode = "report-only"

/** A directive and its source list; an empty list serialises to the name alone. */
type Directive = readonly [name: string, sources: readonly string[]]

function directives({ dev }: { dev: boolean }): Directive[] {
  // Dev bundlers wrap every module in eval() and React Refresh evaluates
  // replacement modules; a production bundle needs neither.
  const scriptSrc = dev ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"] : ["'self'", "'unsafe-inline'"]

  // The HMR socket. Current browsers do treat 'self' as covering ws:// on the
  // same origin, but not every browser a contributor runs locally does.
  const connectSrc = dev ? ["'self'", "ws:"] : ["'self'"]

  return [
    // The floor for every fetch directive not named below — manifest-src,
    // media-src, worker-src. The app has no <video>, <audio>, <object> or
    // Worker, so nothing needs carving out; a media preview would need its own
    // media-src for the presigned S3 host.
    ["default-src", ["'self'"]],

    // An injected <base href="https://evil/"> repoints every relative script
    // and style URL in the document. Nothing in the app sets <base>.
    ["base-uri", ["'self'"]],

    // No <object> or <embed> anywhere in src/. The PDF preview is an
    // <iframe src=…>, which is frame-src — if it ever becomes an <embed>, this
    // line is what blocks it.
    ["object-src", ["'none'"]],

    // The modern counterpart of the X-Frame-Options: DENY already in
    // next.config.ts, and the one that takes precedence where both are honoured.
    ["frame-ancestors", ["'none'"]],

    // Stops an injected <form> posting a session-bearing request off-origin.
    // See item 4 on CSP_MODE for the two server actions this interacts with.
    ["form-action", ["'self'"]],

    // The honest one. Next 15's App Router streams the RSC payload to the
    // client in inline <script>self.__next_f.push(…)</script> tags, and
    // layout.tsx runs an inline theme script before hydration to avoid a
    // wrong-theme flash. Neither carries a nonce unless middleware injects one
    // into the request's CSP header for Next to pick up, and this app has no
    // middleware. Hashing only the theme script would be actively harmful:
    // under CSP3 any hash or nonce in script-src makes browsers IGNORE
    // 'unsafe-inline', so the framework's own inline scripts become the
    // casualty. Dropping 'unsafe-inline' is a middleware+nonce project, not an
    // edit to this line. State the cost plainly: while 'unsafe-inline' is here,
    // a `javascript:` href surviving mammoth's DOCX→HTML conversion is still
    // permitted — browsers check javascript: URLs against script-src, and
    // 'unsafe-inline' admits them. This policy contains that injection; only
    // sanitising removes it.
    ["script-src", scriptSrc],

    // What makes the line above tolerable. script-src-attr governs inline
    // event-handler ATTRIBUTES (onerror=, onclick=) separately from inline
    // <script> elements, so 'none' kills `<img src=x onerror=…>` — the vector a
    // DOCX-derived HTML injection actually has, since markup inserted through
    // innerHTML never executes <script> elements — while the framework's inline
    // <script> tags keep working under script-src. React attaches every
    // listener through its own root delegation and emits no handler attributes,
    // so nothing in this app needs them. Browsers without CSP3 support ignore
    // the directive and fall back to script-src.
    ["script-src-attr", ["'none'"]],

    // Permanent, not provisional. The UI sets hundreds of React `style={{…}}`
    // props, which become style ATTRIBUTES, and nonces never apply to
    // attributes — only 'unsafe-inline' admits them. Tightening this means
    // deleting every inline style, not changing this line.
    ["style-src", ["'self'", "'unsafe-inline'"]],

    // data: is required by mammoth, which inlines DOCX-embedded images as data
    // URIs. The blanket https: is a product decision, not laziness:
    // ClubImageEditor and ProfileImageEditor exist so a user can paste any
    // image URL, and the logo/avatar renders straight from it. Route those
    // through the /api/org-image and /api/profile-image proxies that already
    // exist for uploads and this can become `'self' data:`. Until then an
    // injected <img> can still beacon a URL out — the known hole in this policy.
    ["img-src", ["'self'", "data:", "https:"]],

    // next/font self-hosts Inter and Plus Jakarta Sans into /_next/static at
    // build (layout.tsx), so there is no external font origin to allow.
    ["font-src", ["'self'", "data:"]],

    // Every client fetch in the app is a same-origin relative path (/api/…,
    // server actions). The Anthropic call in src/lib/ai.ts runs server-side in
    // Node, which no browser policy governs.
    ["connect-src", connectSrc],

    // The PDF preview iframes a presigned S3 URL directly. The host is
    // `<bucket>.s3.<region>.amazonaws.com` and the bucket is unknown at build
    // time (see the module header), so this is as narrow as it gets without
    // threading a build arg through the Dockerfile.
    ["frame-src", ["'self'", "https://*.amazonaws.com"]],
  ]
}

/** Serialise the policy for a header value. Pure — the unit under test. */
export function buildContentSecurityPolicy(options: { dev: boolean }): string {
  return directives(options)
    .map(([name, sources]) => (sources.length > 0 ? `${name} ${sources.join(" ")}` : name))
    .join("; ")
}

/** The `{ key, value }` pair next.config.ts's `headers()` wants. */
export function contentSecurityPolicyHeader(options: { mode: CspMode; dev: boolean }): {
  key: string
  value: string
} {
  return {
    key: CSP_HEADER_NAME[options.mode],
    value: buildContentSecurityPolicy({ dev: options.dev }),
  }
}
