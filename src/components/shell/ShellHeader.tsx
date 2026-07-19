"use client"

import Link from "next/link"
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components"
import { ChevronDown, LogOut, UserRound } from "@/components/ui/icons"
import { TenureAIMark, TenureLogo } from "@/components/brand/TenureLogo"
import { EmailLink } from "@/components/EmailLink"
import { SearchCommand } from "./SearchCommand"
import { NotificationBell } from "./NotificationBell"
import { useAI } from "@/components/ai/AIProvider"

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
  const { openPanel } = useAI()
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex h-shell items-center gap-3 px-4 sm:px-5"
      style={{ background: "var(--shell-bg)", borderBottom: "1px solid var(--shell-border)" }}
    >
      {/* Brand — rosette + wordmark */}
      <Link
        href="/dashboard"
        className="flex shrink-0 items-center gap-2.5 text-white no-underline"
      >
        <TenureLogo size={26} color="#25a96d" />
        <span className="font-display text-lg font-bold tracking-tight">Tenure</span>
      </Link>

      {orgName && (
        <>
          <div className="hidden h-6 w-px shrink-0 sm:block" style={{ background: "var(--shell-border)" }} />
          <span
            className="hidden max-w-[200px] truncate text-sm md:block"
            style={{ color: "var(--shell-text-secondary)" }}
          >
            {orgName}
          </span>
        </>
      )}

      {/* Flexible gap pushes the utilities to the right */}
      <div className="min-w-0 flex-1" />

      {/* Right utilities — Tenure AI sits directly beside global search, and
          search sits directly left of the notification bell. */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openPanel}
            className="hidden h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors md:inline-flex"
            style={{
              color: "#ffffff",
              background: "rgba(37, 169, 109, 0.18)",
              border: "1px solid rgba(37, 169, 109, 0.45)",
            }}
            aria-label="Ask Tenure AI"
          >
            <TenureAIMark size={17} color="#2fbf7d" />
            Tenure AI
          </button>

          <SearchCommand />
        </div>

        <NotificationBell initialUnread={unreadNotifications} />

        {/* User menu */}
        <MenuTrigger>
          <Button
            className="flex h-10 items-center gap-2 rounded-lg px-1.5 pr-2.5 transition-colors outline-none data-[hovered]:bg-[--shell-item-hover] data-[focus-visible]:ring-2 data-[focus-visible]:ring-[--primary]"
            style={{ color: "var(--shell-text-secondary)" }}
            aria-label="User menu"
          >
            <div
              className="grid h-7 w-7 place-items-center rounded-full text-[13px] font-semibold text-white"
              style={{ background: "var(--primary)" }}
            >
              {userName[0]?.toUpperCase()}
            </div>
            <span className="hidden text-sm text-white sm:block">{userName}</span>
            <ChevronDown size={14} />
          </Button>
          <Popover
            placement="bottom end"
            className="pop-panel min-w-60 rounded-lg border border-border bg-surface shadow-lg outline-none"
          >
            <div className="border-b border-border px-4 py-3.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-text-1">
                <UserRound size={15} className="text-text-3" /> {userName}
              </p>
              {userEmail && (
                <p className="mt-0.5 text-[13px]">
                  <EmailLink email={userEmail} />
                </p>
              )}
            </div>
            <Menu className="p-1.5 outline-none">
              <MenuItem
                onAction={() => onSignOut?.()}
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2.5 text-sm text-text-1 outline-none data-[focused]:bg-base"
              >
                <LogOut size={15} className="text-text-3" />
                Sign out / switch user
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>
    </header>
  )
}
