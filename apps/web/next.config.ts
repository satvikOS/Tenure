import path from "node:path"
import type { NextConfig } from "next"

const securityHeaders = [
  // Two years HSTS incl. subdomains — CloudFront already forces HTTPS
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // The CloudFront edge gate is off until Cognito SSO lands, so the sign-in page
  // is publicly reachable and would otherwise be crawled. A named university's
  // pilot showing up in search results is not something anyone chose, and
  // `noindex` costs nothing. Every page behind sign-in is already unreachable to
  // a crawler; this covers the ones that are not.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
]

const nextConfig: NextConfig = {
  // Standalone output creates a self-contained server bundle for Docker.
  // Only enabled there (NEXT_STANDALONE=1) — `next start` (used by the
  // Playwright e2e suite) does not support standalone output.
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" as const } : {}),

  // Pin the file-tracing root to the monorepo root instead of letting Next
  // infer it by walking up for lockfiles. The inference is a warning, not an
  // error, and getting it wrong relocates the standalone output: with the root
  // at apps/web the bundle is .next/standalone/server.js, with the root here it
  // is .next/standalone/apps/web/server.js. The Dockerfile COPY paths and
  // scripts/entrypoint.sh both assume the latter, so this is pinned rather than
  // discovered. Set unconditionally (not only under NEXT_STANDALONE) so dev,
  // build and turbopack all agree on the same root.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  poweredByHeader: false,

  // sanitize-html (the document-HTML sanitizer, see api/documents/_lib/sanitize.ts)
  // is CommonJS but its parser chain — htmlparser2 and the dom* / entities
  // packages under it — ships ESM-only. Two things then depend on someone
  // transpiling it: `require(esm)` only exists from Node 20.19, and the runtime
  // image is `node:20-alpine` (a floating tag); and next/jest derives its
  // transformIgnorePatterns from this list, so without it the sanitizer's unit
  // tests cannot even load the module they test. Listing the chain here settles
  // both. Keep in sync with sanitize-html's ESM dependencies.
  transpilePackages: [
    "sanitize-html",
    "htmlparser2",
    "domhandler",
    "domutils",
    "dom-serializer",
    "domelementtype",
    "entities",
  ],

  experimental: {
    // Server Actions default to a 1 MB request-body cap, which silently
    // contradicts the advertised 15 MB document / 25 MB attachment uploads.
    // Raise it to comfortably cover the 15 MB pilot limit (plus base64 slack
    // from the in-place editor's autosave payloads).
    serverActions: { bodySizeLimit: "16mb" },
  },

  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
}

export default nextConfig
