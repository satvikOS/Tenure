"use client"

import Link from "next/link"
import {
  Bell,
  Search,
  ChevronDown,
  GraduationCap,
} from "lucide-react"

interface ShellHeaderProps {
  userName?: string
  orgName?: string
}

export function ShellHeader({ userName = "User", orgName }: ShellHeaderProps) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-shell flex items-center px-4 gap-4"
      style={{ background: "var(--shell-bg)", borderBottom: "1px solid var(--shell-border)" }}
    >
      {/* Brand */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2.5 shrink-0 text-white no-underline"
      >
        <div
          className="w-7 h-7 rounded flex items-center justify-center"
          style={{ background: "var(--primary)" }}
        >
          <GraduationCap size={15} strokeWidth={2.5} />
        </div>
        <span className="text-sm font-semibold tracking-tight">Tenure</span>
      </Link>

      {/* Separator */}
      <div
        className="w-px h-5 shrink-0"
        style={{ background: "var(--shell-border)" }}
      />

      {/* Context label (current org) */}
      {orgName && (
        <span
          className="text-xs truncate max-w-[180px]"
          style={{ color: "var(--shell-text-secondary)" }}
        >
          {orgName}
        </span>
      )}

      {/* Global search */}
      <div className="flex-1 max-w-md mx-auto">
        <div
          className="flex items-center gap-2 h-8 px-3 rounded text-xs w-full transition-colors cursor-text"
          style={{
            background: "var(--shell-item-hover)",
            border: "1px solid var(--shell-border)",
            color: "var(--shell-text-secondary)",
          }}
          role="button"
          tabIndex={0}
          aria-label="Search Tenure"
        >
          <Search size={13} />
          <span>Search members, docs, approvals…</span>
          <kbd
            className="ml-auto text-xs px-1 rounded"
            style={{
              background: "var(--shell-border)",
              color: "var(--shell-text-secondary)",
              fontFamily: "inherit",
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 ml-auto">
        {/* Notifications */}
        <button
          className="relative w-8 h-8 flex items-center justify-center rounded transition-colors"
          style={{ color: "var(--shell-text-secondary)" }}
          aria-label="Notifications"
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--shell-item-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Bell size={16} />
          {/* Unread indicator */}
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--warning)" }}
          />
        </button>

        {/* User menu */}
        <button
          className="flex items-center gap-2 h-8 px-2 rounded transition-colors"
          style={{ color: "var(--shell-text-secondary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--shell-item-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          aria-label="User menu"
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white"
            style={{ background: "var(--primary)" }}
          >
            {userName[0]?.toUpperCase()}
          </div>
          <span className="text-xs hidden sm:block text-white">{userName}</span>
          <ChevronDown size={12} />
        </button>
      </div>
    </header>
  )
}
