"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutGrid, Building2, Users, ScrollText, type LucideIcon } from "lucide-react"

const TABS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/admin/clubs", label: "Clubs", icon: Building2 },
  { href: "/admin/people", label: "Directory & Access", icon: Users },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Admin sections">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href)
        const Icon = t.icon
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-[15px] font-medium no-underline transition-colors ${
              active
                ? "border-[--accent] text-[--accent]"
                : "border-transparent text-text-2 hover:text-text-1"
            }`}
          >
            <Icon size={17} className={active ? "text-[--accent]" : "text-text-3"} />
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
