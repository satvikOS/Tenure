import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Standalone output creates a self-contained server bundle for Docker.
  // Only enabled there (NEXT_STANDALONE=1) — `next start` (used by the
  // Playwright e2e suite) does not support standalone output.
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
}

export default nextConfig
