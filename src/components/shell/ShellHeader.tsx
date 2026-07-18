"use client"

import Link from "next/link"
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components"
import { Bell, Search, ChevronDown, LogOut, UserRound } from "lucide-react"
import { TenureAIMark, TenureLogo } from "@/components/brand/TenureLogo"
import { EmailLink } from "@/components/EmailLink"

interface ShellHeaderProps {
  userName?: string
  userEmail?: string
  orgName?: string
  unreadNotifications?: number
  onSignOut?: () => Promise<void>
}

export function ShellHeader({
  userName = "User",
  userEmail,
  orgName,
  unreadNotifications = 0,
  onSignOut,
}: ShellHeaderProps) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-shell flex items-center px-4 gap-4"
      style={{ background: "var(--shell-bg)", borderBottom: "1px solid var(--shell-border)" }}
    >
      {/* Brand — rosette + wordmark from tenure-landing */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 shrink-0 text-white no-underline"
      >
        <TenureLogo size={20} color="#25a96d" />
        <span className="text-sm font-semibold tracking-tight">Tenure</span>
      </Link>

      {/* Separator */}
      <div
        className="w-px h-5 shrink-0"
        style={{ background: "var(--shell-border)" }}
      />

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

      {/* Tenure AI — its own entry point beside search */}
      <Link
        href="/search"
        className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium no-underline transition-colors shrink-0"
        style={{
          color: "#ffffff",
          background: "rgba(37, 169, 109, 0.18)",
          border: "1px solid rgba(37, 169, 109, 0.45)",
        }}
        aria-label="Ask Tenure AI"
      >
        <TenureAIMark size={15} color="#2fbf7d" />
        Tenure AI
      </Link>

      {/* Right actions */}
      <div className="flex items-center gap-1 ml-auto">
        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative w-8 h-8 flex items-center justify-center rounded transition-colors no-underline hover:bg-[--shell-item-hover]"
          style={{ color: "var(--shell-text-secondary)" }}
          aria-label={`Notifications${unreadNotifications ? ` (${unreadNotifications} unread)` : ""}`}
        >
          <Bell size={16} />
          {unreadNotifications > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
              style={{ background: "var(--error)" }}
            >
              {unreadNotifications > 9 ? "9+" : unreadNotifications}
            </span>
          )}
        </Link>

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
              {userEmail && (
                <p className="text-xs mt-0.5">
                  <EmailLink email={userEmail} />
                </p>
              )}
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
