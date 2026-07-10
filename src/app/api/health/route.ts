// ALB + Docker health check endpoint — must remain fast with no DB dependency
export function GET() {
  return Response.json({
    status: "ok",
    version: process.env.IMAGE_TAG ?? "unknown",
    timestamp: new Date().toISOString(),
  })
}
