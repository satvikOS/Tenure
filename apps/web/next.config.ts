import path from "node:path"
import type { NextConfig } from "next"
// Relative, not "@/lib/csp": Next transpiles this file on its own with a bare
// SWC pass (no bundler, no tsconfig path resolution for the string it compiles)
// and loads the result through a require hook that understands .ts. A relative
// specifier resolves under that hook; the "@/" alias is not guaranteed to.
import { CSP_MODE, contentSecurityPolicyHeader } from "./src/lib/csp"

// The Next CLI sets NODE_ENV in a preAction hook before this file is loaded —
// "development" for `next dev`, "production" for `next build` — and those are
// the only two commands where headers() runs at all (`next start` replays the
// header list baked into .next/routes-manifest.json at build). So this is a
// reliable read of "am I about to serve the dev bundler's output".
const isDev = process.env.NODE_ENV !== "production"

const securityHeaders = [
  // Two years HSTS incl. subdomains — CloudFront already forces HTTPS
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Report-only for now, so a directive this app turns out to need cannot take
  // the product down. src/lib/csp.ts holds the policy, the reasoning per
  // directive, and CSP_MODE — the single constant to flip once the checklist
  // documented on it has been walked on a deployed build.
  contentSecurityPolicyHeader({ mode: CSP_MODE, dev: isDev }),
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
