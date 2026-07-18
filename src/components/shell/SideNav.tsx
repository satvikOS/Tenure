"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  CheckCircle,
  Calendar,
  MessageSquare,
  Newspaper,
  Settings,
  Building2,
  BarChart3,
  Bell,
  BookOpen,
  ShieldCheck,
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

function buildNav(showReports?: boolean, showAdmin?: boolean): NavSection[] {
  return [
    ...(showAdmin
      ? [
          {
            label: "Administration",
            items: [{ label: "Admin Console", href: "/admin", icon: ShieldCheck }],
          },
        ]
      : []),
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
        { label: "Community Feed", href: "/feed", icon: Newspaper },
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
        { label: "Resources", href: "/resources", icon: BookOpen },
        { label: "Tenure AI", href: "/search", icon: TenureAIMark, ai: true },
      ],
    },
  ]
}

interface SideNavProps {
  showReports?: boolean
  showAdmin?: boolean
}

function ItemLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={`
        mx-2.5 flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] no-underline transition-colors
        ${
          active
            ? "bg-[--primary-light] font-semibold text-[--primary]"
            : "text-text-2 hover:bg-base hover:text-text-1"
        }
      `}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        size={19}
        {...(item.ai ? {} : { strokeWidth: active ? 2.4 : 2 })}
        className={active ? "text-[--primary]" : "text-text-3"}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

export function SideNav({ showReports, showAdmin }: SideNavProps) {
  const pathname = usePathname()
  const sections = buildNav(showReports, showAdmin)
  const isActive = (href: string, label: string) =>
    label === "Tenure AI"
      ? false // Search entry owns the highlight for /search
      : pathname === href || (href !== "/dashboard" && pathname.startsWith(href))

  return (
    <nav
      className="fixed left-0 z-40 flex w-sidenav flex-col border-r border-border bg-surface"
      style={{ top: "var(--shell-height)", bottom: 0 }}
      aria-label="Primary navigation"
    >
      <div className="flex-1 overflow-y-auto py-4">
        {sections.map((section, si) => (
          <div key={si} className="mb-4">
            {section.label && (
              <p className="mb-1.5 px-4 text-meta font-semibold uppercase tracking-wider text-text-3">
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
      <div className="shrink-0 border-t border-border py-2.5">
        <ItemLink
          item={{ label: "Settings", href: "/settings", icon: Settings }}
          active={pathname.startsWith("/settings")}
        />
      </div>
    </nav>
  )
}
