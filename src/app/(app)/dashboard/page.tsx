import type { Metadata } from "next"
import Link from "next/link"
import {
  CheckCircle,
  Calendar,
  MessageSquare,
  Users,
  ArrowRight,
  Clock,
  TrendingUp,
} from "lucide-react"
import { Card, CardHeader } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"

export const metadata: Metadata = { title: "Dashboard" }

// ─── Static placeholder data (replaced with real queries once DB is wired) ───

const kpis = [
  {
    label: "Pending Approvals",
    value: "3",
    change: "+1 this week",
    icon: CheckCircle,
    color: "var(--warning)",
    bg: "var(--warning-light)",
    href: "/approvals",
  },
  {
    label: "Upcoming Events",
    value: "7",
    change: "Next 30 days",
    icon: Calendar,
    color: "var(--primary)",
    bg: "var(--primary-light)",
    href: "/calendar",
  },
  {
    label: "Unread Messages",
    value: "12",
    change: "Across 4 threads",
    icon: MessageSquare,
    color: "var(--success)",
    bg: "var(--success-light)",
    href: "/messages",
  },
  {
    label: "Active Members",
    value: "28",
    change: "5 clubs enrolled",
    icon: Users,
    color: "var(--text-2)",
    bg: "var(--bg-base)",
    href: "/orgs",
  },
]

const recentActivity = [
  {
    id: 1,
    type: "approval",
    actor: "VP Finance",
    org: "Finance Club",
    action: "submitted a budget request for Q1 event",
    status: "PENDING_PRESIDENT" as const,
    time: "10 min ago",
  },
  {
    id: 2,
    type: "event",
    actor: "President",
    org: "Marketing Club",
    action: "proposed 'Brand Workshop' for Oct 14",
    status: "PENDING_OSE" as const,
    time: "1 hr ago",
  },
  {
    id: 3,
    type: "member",
    actor: "OSE",
    org: "Consulting Club",
    action: "approved incoming President for shadow access",
    status: "APPROVED" as const,
    time: "3 hr ago",
  },
  {
    id: 4,
    type: "approval",
    actor: "VP Events",
    org: "Entrepreneurship Club",
    action: "submitted vendor contract for review",
    status: "PENDING_PRESIDENT" as const,
    time: "Yesterday",
  },
]

const clubs = [
  { slug: "finance-club",        name: "Finance Club",          members: 4, pending: 2 },
  { slug: "marketing-club",      name: "Marketing Club",        members: 5, pending: 1 },
  { slug: "consulting-club",     name: "Consulting Club",       members: 4, pending: 0 },
  { slug: "entrepreneurship",    name: "Entrepreneurship Club", members: 3, pending: 1 },
  { slug: "operations-club",     name: "Operations Club",       members: 4, pending: 0 },
]

const statusVariantMap = {
  PENDING_PRESIDENT: "warning",
  PENDING_OSE: "info",
  APPROVED: "success",
  REJECTED: "error",
  DRAFT: "draft",
  NEEDS_CHANGES: "warning",
  CANCELLED: "draft",
} as const

const statusLabelMap = {
  PENDING_PRESIDENT: "Pending President",
  PENDING_OSE: "Pending OSE",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  DRAFT: "Draft",
  NEEDS_CHANGES: "Needs Changes",
  CANCELLED: "Cancelled",
}

export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-1">OSE Dashboard</h1>
        <p className="text-sm text-text-2 mt-0.5">
          Simon Business School — Fall 2026 Pilot
        </p>
      </div>

      {/* KPI tiles — SAP Fiori launchpad pattern */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="block no-underline">
            <Card className="hover:shadow transition-shadow cursor-pointer h-full">
              <div className="flex items-start justify-between gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: kpi.bg }}
                >
                  <kpi.icon size={18} style={{ color: kpi.color }} strokeWidth={2} />
                </div>
                <TrendingUp size={14} className="text-text-3 mt-1" />
              </div>
              <p
                className="mt-3 text-2xl font-bold"
                style={{ color: "var(--text-1)", letterSpacing: "-0.02em" }}
              >
                {kpi.value}
              </p>
              <p className="text-xs text-text-2 mt-0.5">{kpi.label}</p>
              <p className="text-xs text-text-3 mt-1">{kpi.change}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent activity feed */}
        <div className="lg:col-span-2">
          <Card padding="none">
            <div className="p-5 border-b border-border">
              <CardHeader
                title="Recent Activity"
                subtitle="Across all clubs"
                action={
                  <Button variant="ghost" size="sm">
                    View all
                  </Button>
                }
              />
            </div>
            <ul className="divide-y divide-border">
              {recentActivity.map((item) => (
                <li key={item.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-base transition-colors">
                  <div className="mt-0.5 shrink-0">
                    <Clock size={14} className="text-text-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-1">
                      <span className="font-medium">{item.actor}</span>
                      {" "}
                      <span className="text-text-2">{item.org}</span>
                      {" — "}
                      {item.action}
                    </p>
                    <p className="text-xs text-text-3 mt-0.5">{item.time}</p>
                  </div>
                  <Badge variant={statusVariantMap[item.status]}>
                    {statusLabelMap[item.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Club roster */}
        <div>
          <Card padding="none">
            <div className="p-5 border-b border-border">
              <CardHeader
                title="Enrolled Clubs"
                subtitle="Fall 2026 pilot cohort"
                action={
                  <Button variant="ghost" size="sm">
                    Manage
                  </Button>
                }
              />
            </div>
            <ul className="divide-y divide-border">
              {clubs.map((club) => (
                <li key={club.slug}>
                  <Link
                    href={`/orgs/${club.slug}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-base transition-colors no-underline"
                  >
                    {/* Avatar */}
                    <div
                      className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: "var(--primary)" }}
                    >
                      {club.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-1 truncate">{club.name}</p>
                      <p className="text-xs text-text-3">{club.members} board members</p>
                    </div>
                    {club.pending > 0 && (
                      <span
                        className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                        style={{ background: "var(--warning-light)", color: "var(--warning)" }}
                      >
                        {club.pending}
                      </span>
                    )}
                    <ArrowRight size={14} className="text-text-3 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="p-4">
              <Button variant="secondary" size="sm" className="w-full">
                + Enroll a club
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
