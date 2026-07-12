"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  CheckCircle,
  Calendar,
  MessageSquare,
  Search,
  Settings,
  Building2,
  BarChart3,
  Bell,
  type LucideIcon,
} from "lucide-react"
import { TenureAIMark } from "@/components/brand/TenureLogo"

interface NavItem {
  label: string
  href: string
  icon: LucideIcon | typeof TenureAIMark
  ai?: boolean
}

interface NavSection {
  label?: string
  items: NavItem[]
}

function buildNav(showReports?: boolean): NavSection[] {
  return [
    {
      label: "Overview",
      items: [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { label: "Notifications", href: "/notifications", icon: Bell },
        ...(showReports ? [{ label: "Reports", href: "/reports", icon: BarChart3 }] : []),
      ],
    },
    {
      label: "Community",
      items: [
        { label: "All Clubs", href: "/orgs", icon: Building2 },
        { label: "Messages", href: "/messages", icon: MessageSquare },
      ],
    },
    {
      label: "Operations",
      items: [
        { label: "Approvals", href: "/approvals", icon: CheckCircle },
        { label: "Calendar", href: "/calendar", icon: Calendar },
      ],
    },
    {
      label: "Knowledge",
      items: [
        { label: "Search", href: "/search", icon: Search },
        { label: "Tenure AI", href: "/search", icon: TenureAIMark, ai: true },
      ],
    },
  ]
}

interface SideNavProps {
  showReports?: boolean
}

function ItemLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={`
        flex items-center gap-3 mx-2 px-3 h-9 rounded text-sm transition-colors no-underline
        ${
          active
            ? "bg-[--primary-light] text-[--primary] font-medium"
            : "text-text-2 hover:bg-base hover:text-text-1"
        }
      `}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        size={16}
        {...(item.ai ? {} : { strokeWidth: active ? 2.5 : 2 })}
        className={active ? "text-[--primary]" : "text-text-3"}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

export function SideNav({ showReports }: SideNavProps) {
  const pathname = usePathname()
  const sections = buildNav(showReports)
  const isActive = (href: string, label: string) =>
    label === "Tenure AI"
      ? false // Search entry owns the highlight for /search
      : pathname === href || (href !== "/dashboard" && pathname.startsWith(href))

  return (
    <nav
      className="fixed left-0 z-40 flex flex-col w-sidenav border-r border-border bg-surface"
      style={{ top: "var(--shell-height)", bottom: 0 }}
      aria-label="Primary navigation"
    >
      <div className="flex-1 overflow-y-auto py-3">
        {sections.map((section, si) => (
          <div key={si} className="mb-3">
            {section.label && (
              <p className="px-4 mb-1 text-xs font-semibold text-text-3 uppercase tracking-wider">
                {section.label}
              </p>
            )}
            {section.items.map((item) => (
              <ItemLink
                key={item.label}
                item={item}
                active={isActive(item.href, item.label)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Settings pinned at the bottom */}
      <div className="border-t border-border py-2 shrink-0">
        <ItemLink
          item={{ label: "Settings", href: "/settings", icon: Settings }}
          active={pathname.startsWith("/settings")}
        />
      </div>
    </nav>
  )
}
