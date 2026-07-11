"use client"

import Link from "next/link"
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components"
import {
  Bell,
  Search,
  ChevronDown,
  GraduationCap,
  LogOut,
  UserRound,
} from "lucide-react"

interface ShellHeaderProps {
  userName?: string
  userEmail?: string
  orgName?: string
  onSignOut?: () => Promise<void>
}

export function ShellHeader({
  userName = "User",
  userEmail,
  orgName,
  onSignOut,
}: ShellHeaderProps) {
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
      <form action="/search" method="get" className="flex-1 max-w-md mx-auto">
        <div
          className="flex items-center gap-2 h-8 px-3 rounded text-xs w-full transition-colors focus-within:ring-1 focus-within:ring-[--primary]"
          style={{
            background: "var(--shell-item-hover)",
            border: "1px solid var(--shell-border)",
            color: "var(--shell-text-secondary)",
          }}
        >
          <Search size={13} className="shrink-0" />
          <input
            name="q"
            placeholder="Search memory, docs, approvals…"
            aria-label="Search Tenure"
            className="flex-1 bg-transparent outline-none text-xs text-white placeholder:text-[--shell-text-secondary]"
          />
        </div>
      </form>

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
        <MenuTrigger>
          <Button
            className="flex items-center gap-2 h-8 px-2 rounded transition-colors outline-none data-[hovered]:bg-[--shell-item-hover] data-[focus-visible]:ring-2 data-[focus-visible]:ring-[--primary]"
            style={{ color: "var(--shell-text-secondary)" }}
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
          </Button>
          <Popover
            placement="bottom end"
            className="min-w-56 rounded-lg border border-border bg-surface shadow-lg outline-none entering:animate-in exiting:animate-out"
          >
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-text-1 flex items-center gap-2">
                <UserRound size={14} className="text-text-3" /> {userName}
              </p>
              {userEmail && <p className="text-xs text-text-3 mt-0.5">{userEmail}</p>}
            </div>
            <Menu className="p-1 outline-none">
              <MenuItem
                onAction={() => onSignOut?.()}
                className="flex items-center gap-2 rounded px-3 py-2 text-sm text-text-1 cursor-pointer outline-none data-[focused]:bg-base"
              >
                <LogOut size={14} className="text-text-3" />
                Sign out / switch user
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>
    </header>
  )
}
