// ALB + Docker health check endpoint — must remain fast with no DB dependency
export function GET() {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() })
}
