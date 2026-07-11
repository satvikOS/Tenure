"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  CheckCircle,
  Calendar,
  MessageSquare,
  FolderOpen,
  DollarSign,
  Brain,
  Settings,
  Building2,
  type LucideIcon,
} from "lucide-react"

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: number
}

interface NavSection {
  label?: string
  items: NavItem[]
}

function buildNav(orgSlug?: string): NavSection[] {
  const base = orgSlug ? `/orgs/${orgSlug}` : "/dashboard"

  return [
    {
      items: [
        { label: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
        { label: "All Clubs",  href: "/orgs",       icon: Building2 },
        { label: "Approvals",  href: "/approvals",  icon: CheckCircle },
        { label: "Calendar",   href: "/calendar",   icon: Calendar },
        { label: "Messages",   href: "/messages",   icon: MessageSquare },
      ],
    },
    {
      label: orgSlug ? "Club Workspace" : undefined,
      items: orgSlug
        ? [
            { label: "Members",    href: `${base}/members`,    icon: Users },
            { label: "Approvals",  href: `${base}/approvals`,  icon: CheckCircle },
            { label: "Calendar",   href: `${base}/calendar`,   icon: Calendar },
            { label: "Messages",   href: `${base}/messages`,   icon: MessageSquare },
            { label: "Documents",  href: `${base}/documents`,  icon: FolderOpen },
            { label: "Budget",     href: `${base}/budget`,     icon: DollarSign },
            { label: "Memory",     href: `${base}/memory`,     icon: Brain },
          ]
        : [],
    },
    {
      items: [
        { label: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ]
}

interface SideNavProps {
  orgSlug?: string
}

export function SideNav({ orgSlug }: SideNavProps) {
  const pathname = usePathname()
  const sections = buildNav(orgSlug)

  return (
    <nav
      className="fixed left-0 z-40 flex flex-col w-sidenav border-r border-border bg-surface"
      style={{ top: "var(--shell-height)", bottom: 0 }}
      aria-label="Primary navigation"
    >
      <div className="flex-1 overflow-y-auto py-3">
        {sections.map((section, si) => {
          const visibleItems = section.items.filter((item) =>
            // Don't render empty section items
            item.href !== "/dashboard" || !orgSlug || si === 0
          )

          if (visibleItems.length === 0) return null

          return (
            <div key={si} className="mb-2">
              {section.label && (
                <p className="px-4 mb-1 text-xs font-semibold text-text-3 uppercase tracking-wider">
                  {section.label}
                </p>
              )}
              {visibleItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    item.href !== "/orgs" &&
                    pathname.startsWith(item.href))

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      flex items-center gap-3 mx-2 px-3 h-9 rounded text-sm transition-colors
                      ${
                        isActive
                          ? "bg-[--primary-light] text-[--primary] font-medium"
                          : "text-text-2 hover:bg-base hover:text-text-1"
                      }
                    `}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <item.icon
                      size={16}
                      strokeWidth={isActive ? 2.5 : 2}
                      className={isActive ? "text-[--primary]" : "text-text-3"}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          background: "var(--warning-light)",
                          color: "var(--warning)",
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </div>
    </nav>
  )
}
