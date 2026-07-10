import Link from "next/link"
import { redirect } from "next/navigation"
import { Users } from "lucide-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext, isOse } from "@/lib/rbac"
import { Card } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"

export const dynamic = "force-dynamic"

export default async function OrgsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const ctx = await getUserContext(session.user.id)

  // OSE staff see every club at their institution; members see their own.
  const oseInstitutionIds = ctx.institutionRoles.map((m) => m.institutionId)
  const memberOrgIds = ctx.orgRoles
    .filter((r) => r.status === "SHADOW" || r.status === "ACTIVE")
    .map((r) => r.organizationId)

  const orgs = await db.organization.findMany({
    where: {
      OR: [
        { institutionId: { in: oseInstitutionIds } },
        { id: { in: memberOrgIds } },
      ],
    },
    orderBy: { name: "asc" },
    include: {
      roles: {
        include: {
          assignments: {
            where: { status: "ACTIVE" },
            include: { user: { select: { name: true } } },
          },
        },
      },
    },
  })

  const isOseViewer = orgs.some((o) => isOse(ctx, o.institutionId))

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-1">
          {isOseViewer ? "All Clubs" : "My Clubs"}
        </h1>
        <p className="text-sm text-text-2 mt-1">
          {isOseViewer
            ? "Every registered organization at your institution."
            : "Organizations where you hold a current or incoming role."}
        </p>
      </div>

      {orgs.length === 0 ? (
        <Card>
          <p className="text-sm text-text-2">
            No organizations yet. Ask your OSE office for access.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orgs.map((org) => {
            const president = org.roles
              .find((r) => r.scope === "PRESIDENT")
              ?.assignments[0]?.user?.name
            const activeMembers = org.roles.reduce(
              (n, r) => n + r.assignments.length,
              0
            )

            return (
              <Link key={org.id} href={`/orgs/${org.slug}/members`}>
                <Card className="hover:border-[--primary] transition-colors h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-text-1">{org.name}</h2>
                      {org.description && (
                        <p className="text-xs text-text-2 mt-1 line-clamp-2">
                          {org.description}
                        </p>
                      )}
                    </div>
                    <Badge variant={org.status === "ACTIVE" ? "success" : "default"}>
                      {org.status.toLowerCase()}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-xs text-text-3">
                    <span className="inline-flex items-center gap-1">
                      <Users size={13} /> {activeMembers} active
                    </span>
                    {president && <span>President: {president}</span>}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
