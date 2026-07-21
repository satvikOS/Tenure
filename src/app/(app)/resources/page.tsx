import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getUserContext, isOse } from "@/lib/rbac"
import { PageHeader } from "@/components/ui/PageHeader"
import { ResourcesBrowser } from "@/components/ResourcesBrowser"
import { seatKeysForRole, type SeatKey } from "@/lib/resources"

export const dynamic = "force-dynamic"

export default async function ResourcesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const ctx = await getUserContext(session.user.id)

  const mySeats = new Set<SeatKey>(["ALL"])
  for (const role of ctx.orgRoles) {
    if (role.status === "ALUMNI") continue
    for (const key of seatKeysForRole(role.roleName)) mySeats.add(key)
  }
  if (ctx.institutionRoles.length > 0) mySeats.add("OSE")
  const isOseViewer = ctx.institutionRoles.some((m) => isOse(ctx, m.institutionId))

  return (
    <div className="w-full">
      <PageHeader
        title="Board Resources"
        subtitle="Every form, guide and policy your seat needs — searchable, so it survives the handoff instead of living in someone's bookmarks."
      />
      <ResourcesBrowser mySeats={[...mySeats]} isOse={isOseViewer} />
    </div>
  )
}
