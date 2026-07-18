"use client"

import Link from "next/link"
import { Bell } from "lucide-react"

/**
 * Header notification entry. Phase 1 ships the enlarged bell + unread badge as
 * a link to the notifications page; it is upgraded in place to a live dropdown
 * (polling + mark-read) without any change to the shell that renders it.
 */
export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const unread = initialUnread
  return (
    <Link
      href="/notifications"
      className="relative grid h-10 w-10 place-items-center rounded-lg text-[--shell-text-secondary] no-underline transition-colors hover:bg-[--shell-item-hover] hover:text-white"
      aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
    >
      <Bell size={19} />
      {unread > 0 && (
        <span
          className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full px-0.5 text-[10px] font-bold text-white"
          style={{ background: "var(--error)" }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  )
}
