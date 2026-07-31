import type { Metadata } from "next"
import Link from "next/link"
import {
  Building2,
  Users,
  UserCog,
  AlertTriangle,
  CheckCircle,
  Archive,
  ArrowRight,
} from "@/components/ui/icons"
import { db } from "@/lib/db"
import { requireAdminContext } from "@/lib/admin/guard"
import { CAPABILITIES, capabilitiesForRole } from "@/lib/admin/capabilities"
import { summariseSeats } from "@/lib/seats"
import { institutionSeatsWhere, loadSeatFacts } from "@/lib/seats-data"
import { StatGrid, StatTile, BentoGrid, BentoTile } from "@/components/ui/Bento"
import { Badge } from "@/components/ui/Badge"
import { DonutChart, slotColor, STATUS, REFERENCE } from "@/components/charts"
import { bucketByWeek } from "@/components/charts/timeseries"

export const metadata: Metadata = { title: "Admin" }
export const dynamic = "force-dynamic"

export default async function AdminOverviewPage() {
  const { institutionId, role } = await requireAdminContext()

  const now = new Date()
  const TREND_WEEKS = 12
  const trendSince = new Date(now.getTime() - TREND_WEEKS * 7 * 86_400_000)

  const [
    activeClubs,
    archivedClubs,
    seatFacts,
    pendingApprovals,
    approvalTrend,
    people,
    recentAudit,
  ] = await Promise.all([
      db.organization.count({ where: { institutionId, status: "ACTIVE" } }),
      db.organization.count({ where: { institutionId, status: "ARCHIVED" } }),
      // The tile and the donut used to be four separate counting rules, which is
      // how the same institution reported two different fill figures on one
      // screen. Both now read one canonical summary.
      loadSeatFacts(institutionSeatsWhere(institutionId)),
      db.approvalRequest.count({
        where: { institutionId, status: { in: ["PENDING_PRESIDENT", "PENDING_OSE"] } },
      }),
      db.approvalRequest.findMany({
        where: { institutionId, createdAt: { gte: trendSince } },
        select: { createdAt: true },
      }),
      db.directoryPerson.count(),
      db.auditEvent.findMany({
        where: { institutionId },
        orderBy: { occurredAt: "desc" },
        take: 8,
        include: { institution: { select: { name: true } } },
      }),
    ])

  const caps = capabilitiesForRole(role)

  // Seat-fill breakdown for the donut, and a pending-approvals volume trend.
  const seats = summariseSeats(seatFacts)
  const seatData = [
    { label: "Filled", value: seats.filled, color: slotColor(0) },
    { label: "Incoming", value: seats.incoming, color: STATUS.info },
    { label: "Vacant", value: seats.vacant, color: REFERENCE },
  ]
  const approvalSpark = bucketByWeek(approvalTrend.map((a) => a.createdAt), TREND_WEEKS, now)

  const actorIds = [...new Set(recentAudit.map((a) => a.actorId).filter((x): x is string => !!x))]
  const actorNames = new Map<string, string>()
  if (actorIds.length) {
    for (const u of await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    }))
      actorNames.set(u.id, u.name ?? u.email ?? "Unknown")
  }

  return (
    <div className="w-full space-y-6">
      <StatGrid>
        <StatTile label="Active clubs" value={activeClubs} icon={Building2} href="/admin/clubs" />
        <StatTile
          label="Filled seats"
          value={`${seats.filled}/${seats.total}`}
          hint={`${seats.vacant} vacant · ${seats.incoming} incoming`}
          icon={Users}
        />
        <StatTile
          label="Pending approvals"
          value={pendingApprovals}
          icon={CheckCircle}
          href="/approvals"
          spark={approvalSpark}
        />
        <StatTile
          label="Directory people"
          value={people}
          icon={UserCog}
          href="/admin/people"
        />
      </StatGrid>

      <BentoGrid>
        {/* Seat fill across the institution */}
        <BentoTile span={6}>
          <h2 className="mb-4 font-display text-base font-semibold text-text-1">Seat fill</h2>
          <DonutChart
            data={seatData}
            centerValue={`${seats.fillPct}%`}
            centerLabel="filled"
          />
        </BentoTile>

        {/* Quick actions */}
        <BentoTile span={6}>
          <h2 className="mb-4 font-display text-base font-semibold text-text-1">Quick actions</h2>
          <div className="flex flex-col gap-2">
            {[
              { href: "/admin/clubs", label: "Charter or edit a club", icon: Building2 },
              { href: "/admin/clubs", label: "Assign, remove or transfer a role", icon: UserCog },
              { href: "/admin/approvals", label: "Override an approval", icon: CheckCircle },
              { href: "/admin/people", label: "Manage directory & OSE access", icon: Users },
            ].map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3 text-sm font-medium text-text-1 no-underline transition-colors hover:border-[--accent] hover:bg-base"
              >
                <a.icon size={17} className="text-[--accent]" />
                <span className="flex-1">{a.label}</span>
                <ArrowRight size={15} className="text-text-3" />
              </Link>
            ))}
          </div>
          {archivedClubs > 0 && (
            <p className="mt-4 flex items-center gap-2 text-[13px] text-text-3">
              <Archive size={14} /> {archivedClubs} archived club{archivedClubs === 1 ? "" : "s"}
            </p>
          )}
        </BentoTile>

        {/* Your capabilities */}
        <BentoTile span={6}>
          <h2 className="mb-1 font-display text-base font-semibold text-text-1">Your capabilities</h2>
          <p className="mb-4 text-[13px] text-text-2">
            What your OSE role can do across the institution.
          </p>
          <ul className="space-y-2">
            {caps.slice(0, 6).map((id) => (
              <li key={id} className="flex items-start gap-2.5 text-sm">
                <CheckCircle size={16} className="mt-0.5 shrink-0 text-[--success]" />
                <span>
                  <span className="font-medium text-text-1">{CAPABILITIES[id].label}</span>
                  <span className="block text-[13px] text-text-3">{CAPABILITIES[id].description}</span>
                </span>
              </li>
            ))}
          </ul>
          {caps.length > 6 && (
            <p className="mt-3 text-[13px] font-medium text-text-3">
              + {caps.length - 6} more capabilities in your role
            </p>
          )}
        </BentoTile>

        {/* Recent admin activity */}
        <BentoTile span={6}>
          <h2 className="mb-4 font-display text-base font-semibold text-text-1">Recent activity</h2>
          {recentAudit.length === 0 ? (
            <p className="text-sm text-text-3">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentAudit.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-start gap-2.5">
                  {e.outcome === "DENY" ? (
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[--error]" />
                  ) : (
                    <CheckCircle size={15} className="mt-0.5 shrink-0 text-text-3" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-text-1">
                      <span className="font-medium">
                        {e.actorId ? actorNames.get(e.actorId) ?? "System" : "System"}
                      </span>{" "}
                      <span className="text-text-2">{e.action}</span>
                    </p>
                    <p className="text-meta text-text-3">
                      {e.occurredAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {e.outcome === "DENY" && (
                        <Badge variant="error" className="ml-2">
                          denied
                        </Badge>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/admin/audit"
            className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-text-link no-underline hover:underline"
          >
            Full audit log <ArrowRight size={13} />
          </Link>
        </BentoTile>
      </BentoGrid>
    </div>
  )
}
