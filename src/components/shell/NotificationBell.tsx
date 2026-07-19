"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  Button,
  Dialog,
  DialogTrigger,
  Popover,
} from "react-aria-components"
import { Bell, BellOff, CheckCheck } from "@/components/ui/icons"

interface NotificationItem {
  id: string
  title: string
  body: string | null
  href: string | null
  readAt: string | null
  createdAt: string
}

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return "now"
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 604800) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/**
 * The live notification bell. Server-renders the initial unread count so the
 * badge never flashes, then keeps itself current by polling every 30s and on
 * window focus. Clicking opens a dropdown of recent items with mark-all-read
 * and per-item click-through; opening the full page still marks everything read.
 */
export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number }) {
  const [unread, setUnread] = useState(initialUnread)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as { unread: number; items: NotificationItem[] }
      setUnread(data.unread)
      setItems(data.items)
      setLoaded(true)
    } catch {
      /* transient — next poll retries */
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    const onFocus = () => refresh()
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", onFocus)
    }
  }, [refresh])

  const markAllRead = useCallback(async () => {
    setUnread(0)
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    } catch {
      /* optimistic — reconciled on next poll */
    }
  }, [])

  const markOneRead = useCallback((id: string) => {
    setUnread((u) => Math.max(0, u - 1))
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)))
    fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => {})
  }, [])

  return (
    <DialogTrigger onOpenChange={(open) => open && refresh()}>
      <Button
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        className="relative grid h-10 w-10 place-items-center rounded-lg text-[--shell-text-secondary] outline-none transition-colors data-[hovered]:bg-[--shell-item-hover] data-[hovered]:text-white data-[focus-visible]:ring-2 data-[focus-visible]:ring-[--primary]"
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
      </Button>

      <Popover
        placement="bottom end"
        offset={10}
        className="pop-panel w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-surface shadow-lg outline-none"
      >
        <Dialog className="outline-none" aria-label="Notifications">
          {({ close }) => (
            <div className="flex max-h-[70vh] flex-col">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <p className="font-display text-base font-semibold text-text-1">
                  Notifications{unread > 0 ? ` · ${unread} new` : ""}
                </p>
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-text-link outline-none transition-colors hover:bg-base focus-visible:ring-2 focus-visible:ring-[--primary]"
                  >
                    <CheckCheck size={14} /> Mark all read
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loaded && items.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                    <BellOff size={22} className="text-text-3" />
                    <p className="text-sm text-text-2">You&apos;re all caught up.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {items.map((n) => {
                      const unreadItem = !n.readAt
                      const inner = (
                        <div className="flex items-start gap-3 px-4 py-3">
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unreadItem ? "bg-[--primary]" : "bg-transparent"}`}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm ${unreadItem ? "font-semibold text-text-1" : "text-text-2"}`}>
                              {n.title}
                            </p>
                            {n.body && <p className="mt-0.5 line-clamp-2 text-[13px] text-text-2">{n.body}</p>}
                            <p className="mt-0.5 text-meta text-text-3">{ago(n.createdAt)}</p>
                          </div>
                        </div>
                      )
                      return (
                        <li key={n.id} className="transition-colors hover:bg-base">
                          {n.href ? (
                            <Link
                              href={n.href}
                              onClick={() => {
                                markOneRead(n.id)
                                close()
                              }}
                              className="block no-underline"
                            >
                              {inner}
                            </Link>
                          ) : (
                            <button onClick={() => markOneRead(n.id)} className="block w-full text-left outline-none">
                              {inner}
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="border-t border-border px-4 py-2.5">
                <Link
                  href="/notifications"
                  onClick={() => close()}
                  className="block rounded-md py-1.5 text-center text-[13px] font-medium text-text-link no-underline transition-colors hover:bg-base"
                >
                  See all notifications
                </Link>
              </div>
            </div>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  )
}
