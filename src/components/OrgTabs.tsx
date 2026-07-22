"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Finance is readable by anyone; the rest require org membership. When the
// viewer isn't a member (canViewOrg false), show only the tabs they can open
// so a finance-only viewer never lands on a 404.
const MEMBER_ONLY = new Set(["members", "documents", "memory"])
const TABS = [
  { segment: "members", label: "Members" },
  { segment: "finance", label: "Finance" },
  { segment: "documents", label: "Documents" },
  { segment: "memory", label: "Memory" },
]

export function OrgTabs({ slug, canViewOrg = true }: { slug: string; canViewOrg?: boolean }) {
  const pathname = usePathname()
  const tabs = canViewOrg ? TABS : TABS.filter((t) => !MEMBER_ONLY.has(t.segment))
  return (
    <nav className="flex gap-1 border-b border-border mb-6" aria-label="Club sections">
      {tabs.map((t) => {
        const href = `/orgs/${slug}/${t.segment}`
        const active = pathname.startsWith(href)
        return (
          <Link
            key={t.segment}
            href={href}
            className={`px-4 h-9 flex items-center text-sm no-underline border-b-2 -mb-px transition-colors ${
              active
                ? "border-[--primary] text-[--primary] font-medium"
                : "border-transparent text-text-2 hover:text-text-1"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
