import { notFound, redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { canManageRoster, canViewOrg, getUserContext } from "@/lib/rbac"
import { Card, CardHeader } from "@/components/ui/Card"
import { AssignmentBadge, Badge } from "@/components/ui/Badge"
import { assignMember, transitionAssignment } from "./actions"

export const dynamic = "force-dynamic"

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const org = await db.organization.findUnique({
    where: { slug },
    include: {
      roles: {
        orderBy: { scope: "asc" }, // PRESIDENT → FUNCTIONAL → MEMBER
        include: {
          assignments: {
            orderBy: { startDate: "desc" },
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  })
  if (!org) notFound()

  const ctx = await getUserContext(session.user.id)
  if (!canViewOrg(ctx, org)) notFound()
  const canManage = canManageRoster(ctx, org)

  const assignWithSlug = assignMember.bind(null, slug)
  const transitionWithSlug = transitionAssignment.bind(null, slug)

  const current = org.roles.map((role) => ({
    ...role,
    assignments: role.assignments.filter((a) => a.status !== "ALUMNI"),
  }))
  const alumni = org.roles.flatMap((role) =>
    role.assignments
      .filter((a) => a.status === "ALUMNI")
      .map((a) => ({ ...a, roleName: role.name }))
  )

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-1">{org.name}</h1>
        <p className="text-sm text-text-2 mt-1">
          Roster — role seats persist across leadership transitions.
        </p>
      </div>

      <div className="space-y-4">
        {current.map((role) => (
          <Card key={role.id}>
            <CardHeader
              title={role.name}
              subtitle={role.description ?? undefined}
              action={<Badge variant="info">{role.scope.toLowerCase()}</Badge>}
            />
            {role.assignments.length === 0 ? (
              <p className="text-sm text-text-3">Seat is vacant.</p>
            ) : (
              <ul className="divide-y divide-border">
                {role.assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-text-1">
                        {a.user.name ?? a.user.email}
                      </p>
                      <p className="text-xs text-text-3">
                        {a.user.email} · since{" "}
                        {a.startDate.toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <AssignmentBadge status={a.status} />
                      {canManage && a.status === "SHADOW" && (
                        <form action={transitionWithSlug}>
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <input type="hidden" name="to" value="ACTIVE" />
                          <button className="text-xs font-medium text-[--primary] hover:underline">
                            Activate
                          </button>
                        </form>
                      )}
                      {canManage && a.status === "ACTIVE" && (
                        <form action={transitionWithSlug}>
                          <input type="hidden" name="assignmentId" value={a.id} />
                          <input type="hidden" name="to" value="ALUMNI" />
                          <button className="text-xs font-medium text-text-3 hover:underline">
                            End term
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}

        {canManage && (
          <Card>
            <CardHeader
              title="Add to roster"
              subtitle="Assign someone to a role seat. Shadow gives read-only access before the term begins."
            />
            <form action={assignWithSlug} className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-2">
                Email
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="student@rochester.edu"
                  className="h-9 w-64 rounded border border-border px-3 text-sm text-text-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-2">
                Role
                <select
                  name="roleId"
                  required
                  className="h-9 rounded border border-border px-2 text-sm text-text-1 bg-surface"
                >
                  {org.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-2">
                Status
                <select
                  name="status"
                  className="h-9 rounded border border-border px-2 text-sm text-text-1 bg-surface"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="SHADOW">Shadow (incoming)</option>
                </select>
              </label>
              <button
                type="submit"
                className="h-9 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:opacity-90"
              >
                Add
              </button>
            </form>
          </Card>
        )}

        {alumni.length > 0 && (
          <Card>
            <CardHeader
              title="Past holders"
              subtitle="Institutional record — access revoked, history preserved."
            />
            <ul className="divide-y divide-border">
              {alumni.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-text-1">
                      {a.user.name ?? a.user.email}
                    </p>
                    <p className="text-xs text-text-3">
                      {a.roleName} ·{" "}
                      {a.startDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      {" – "}
                      {a.endDate?.toLocaleDateString("en-US", { month: "short", year: "numeric" }) ?? "?"}
                    </p>
                  </div>
                  <AssignmentBadge status="ALUMNI" />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
