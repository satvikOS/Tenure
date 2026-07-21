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
