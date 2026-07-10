import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Standalone output creates a self-contained server bundle for Docker
  output: "standalone",
}

export default nextConfig
