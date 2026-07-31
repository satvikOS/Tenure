import path from "node:path"
import type { NextConfig } from "next"

const securityHeaders = [
  // Two years HSTS incl. subdomains — CloudFront already forces HTTPS
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
    // contradicts the advertised upload limits. This is the TRANSPORT ceiling
    // and the backstop for every upload surface: a request larger than this is
    // refused by the framework before any action code runs, so the user gets a
    // generic failure rather than one of our messages. It therefore has to sit
    // just ABOVE what src/lib/uploads.ts will accept (MAX_UPLOAD_BYTES, 15 MB
    // per file and per request), leaving ~1 MB for multipart framing and the
    // in-place editor's base64 autosave slack. Attachments used to advertise
    // 25 MB, which this cap made unreachable — the attachment limit moved down
    // to 15 MB rather than this moving up, so the number a user is told is the
    // number that works.
    serverActions: { bodySizeLimit: "16mb" },
  },

  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
}

export default nextConfig
