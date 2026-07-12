import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import {
  CheckCircle,
  Calendar,
  MessageSquare,
  Users,
  ArrowRight,
  Clock,
} from "lucide-react"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { Card, CardHeader } from "@/components/ui/Card"

export const metadata: Metadata = { title: "Dashboard" }
export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const ctx = await getUserContext(session.user.id)

  // Same visibility scope as /orgs: OSE sees the institution, members see their clubs
  const oseInstitutionIds = ctx.institutionRoles.map((m) => m.institutionId)
  const memberOrgIds = ctx.orgRoles
    .filter((r) => r.status === "SHADOW" || r.status === "ACTIVE")
    .map((r) => r.organizationId)
  const isOse = oseInstitutionIds.length > 0

  const orgs = await db.organization.findMany({
    where: {
      OR: [
        { institutionId: { in: oseInstitutionIds } },
        { id: { in: memberOrgIds } },
      ],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  })
  const orgIds = orgs.map((o) => o.id)

  const mySeats = await db.roleAssignment.findMany({
    where: { userId: ctx.userId, status: { in: ["ACTIVE", "SHADOW"] } },
    include: {
      role: { include: { organization: { select: { name: true, slug: true } } } },
    },
    orderBy: { startDate: "desc" },
  })

  const [pendingApprovals, upcomingEvents, unreadMessages, activeMembers, memberCounts, recentAudit] =
    await Promise.all([
      db.approvalRequest.count({
        where: {
          organizationId: { in: orgIds },
          status: { in: ["PENDING_PRESIDENT", "PENDING_OSE"] },
        },
      }),
      db.event.count({
        where: { organizationId: { in: orgIds }, startAt: { gte: new Date() } },
      }),
      db.delivery.count({
        where: { readAt: null, participant: { userId: ctx.userId } },
      }),
      db.roleAssignment.count({
        where: { status: "ACTIVE", role: { organizationId: { in: orgIds } } },
      }),
      db.roleAssignment.groupBy({
        by: ["roleId"],
        where: { status: "ACTIVE", role: { organizationId: { in: orgIds } } },
        _count: true,
      }),
      db.auditEvent.findMany({
        where: { organizationId: { in: orgIds } },
        orderBy: { occurredAt: "desc" },
        take: 6,
        include: { institution: { select: { name: true } } },
      }),
    ])

  // Map role→org so club cards show real member counts
  const rolesByOrg = await db.role.findMany({
    where: { organizationId: { in: orgIds } },
    select: { id: true, organizationId: true },
  })
  const orgMemberCount = new Map<string, number>()
  for (const rc of memberCounts) {
    const orgId = rolesByOrg.find((r) => r.id === rc.roleId)?.organizationId
    if (orgId) orgMemberCount.set(orgId, (orgMemberCount.get(orgId) ?? 0) + rc._count)
  }

  const actorNames = new Map<string, string>()
  const actorIds = [...new Set(recentAudit.map((a) => a.actorId).filter((x): x is string => !!x))]
  if (actorIds.length) {
    const users = await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    })
    for (const u of users) actorNames.set(u.id, u.name ?? u.email ?? "Unknown")
  }
  const orgNames = new Map(orgs.map((o) => [o.id, o.name]))

  const kpis = [
    {
      label: "Pending Approvals",
      value: pendingApprovals,
      hint: "Awaiting a decision",
      icon: CheckCircle,
      color: "var(--warning)",
      bg: "var(--warning-light)",
      href: "/approvals",
    },
    {
      label: "Upcoming Events",
      value: upcomingEvents,
      hint: "On the shared calendar",
      icon: Calendar,
      color: "var(--primary)",
      bg: "var(--primary-light)",
      href: "/calendar",
    },
    {
      label: "Unread Messages",
      value: unreadMessages,
      hint: "In your conversations",
      icon: MessageSquare,
      color: "var(--success)",
      bg: "var(--success-light)",
      href: "/messages",
    },
    {
      label: "Active Members",
      value: activeMembers,
      hint: `Across ${orgs.length} club${orgs.length === 1 ? "" : "s"}`,
      icon: Users,
      color: "var(--text-2)",
      bg: "var(--bg-base)",
      href: "/orgs",
    },
  ]

  return (
    <div className="max-w-screen-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-1">
          {isOse ? "OSE Dashboard" : "Dashboard"}
        </h1>
        <p className="text-sm text-text-2 mt-0.5">
          Welcome back, {session.user.name ?? session.user.email}
        </p>
      </div>

      {/* KPI tiles — live counts scoped to what this user can see */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="block no-underline">
            <Card className="hover:shadow transition-shadow cursor-pointer h-full">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: kpi.bg }}
              >
                <kpi.icon size={18} style={{ color: kpi.color }} strokeWidth={2} />
              </div>
              <p
                className="mt-3 text-2xl font-bold"
                style={{ color: "var(--text-1)", letterSpacing: "-0.02em" }}
              >
                {kpi.value}
              </p>
              <p className="text-xs text-text-2 mt-0.5">{kpi.label}</p>
              <p className="text-xs text-text-3 mt-1">{kpi.hint}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent activity — real audit trail */}
        <div className="lg:col-span-2">
          <Card padding="none">
            <div className="p-5 border-b border-border">
              <CardHeader title="Recent Activity" subtitle="From the audit log" />
            </div>
            {recentAudit.length === 0 ? (
              <p className="px-5 py-8 text-sm text-text-3 text-center">
                No activity yet — actions like roster changes will appear here.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {recentAudit.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                    <Clock size={14} className="text-text-3 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-1">
                        <span className="font-medium">
                          {item.actorId ? actorNames.get(item.actorId) ?? "System" : "System"}
                        </span>{" "}
                        <span className="text-text-2">
                          {item.organizationId
                            ? orgNames.get(item.organizationId) ?? ""
                            : item.institution.name}
                        </span>
                        {" — "}
                        {item.action}
                        {item.outcome === "DENY" && " (denied)"}
                      </p>
                      <p className="text-xs text-text-3 mt-0.5">
                        {item.occurredAt.toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Club list — real orgs in scope */}
        <div className="space-y-4">
          {mySeats.length > 0 && (
            <Card padding="none">
              <div className="p-5 border-b border-border">
                <CardHeader
                  title="My seats"
                  subtitle="Your positions — knowledge stays with the job"
                />
              </div>
              <ul className="divide-y divide-border">
                {mySeats.map((s) => {
                  const isPres = s.role.scope === "PRESIDENT" && s.status === "ACTIVE"
                  return (
                    <li key={s.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-text-1 truncate">
                          {s.role.name} · {s.role.organization.name}
                        </p>
                        {s.status === "SHADOW" && (
                          <span className="text-xs shrink-0" style={{ color: "var(--info)" }}>
                            incoming
                          </span>
                        )}
                      </div>
                      {s.role.positionCode && (
                        <p className="text-xs text-text-3 mt-0.5">{s.role.positionCode}</p>
                      )}
                      <div className="flex gap-3 mt-1.5 text-xs">
                        <Link
                          href={`/orgs/${s.role.organization.slug}/memory`}
                          className="text-[--primary] hover:underline no-underline"
                        >
                          Seat memory
                        </Link>
                        {isPres ? (
                          <Link
                            href="/approvals"
                            className="text-[--primary] hover:underline no-underline"
                          >
                            Review requests
                          </Link>
                        ) : s.status === "ACTIVE" ? (
                          <Link
                            href="/approvals/new"
                            className="text-[--primary] hover:underline no-underline"
                          >
                            New request
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}

          <Card padding="none">
            <div className="p-5 border-b border-border">
              <CardHeader
                title={isOse ? "Enrolled Clubs" : "My Clubs"}
                subtitle="Fall 2026 pilot cohort"
              />
            </div>
            {orgs.length === 0 ? (
              <p className="px-5 py-8 text-sm text-text-3 text-center">
                No clubs yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {orgs.map((club) => (
                  <li key={club.id}>
                    <Link
                      href={`/orgs/${club.slug}/members`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-base transition-colors no-underline"
                    >
                      <div
                        className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: "var(--primary)" }}
                      >
                        {club.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-1 truncate">
                          {club.name}
                        </p>
                        <p className="text-xs text-text-3">
                          {orgMemberCount.get(club.id) ?? 0} active member
                          {(orgMemberCount.get(club.id) ?? 0) === 1 ? "" : "s"}
                        </p>
                      </div>
                      <ArrowRight size={14} className="text-text-3 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
