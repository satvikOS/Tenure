import { TenureWordmark } from "@/components/brand/TenureLogo"

/**
 * Hardened footer: a fixed slim bar pinned to the bottom of the content column
 * (right of the side nav), so it stays put while only the main content scrolls.
 * Deliberately quiet — a legal and orientation marker, not a brand moment.
 */
export function Footer() {
  return (
    <footer
      className="fixed bottom-0 right-0 z-40 flex h-footer items-center justify-between gap-3 border-t border-border bg-surface px-4 sm:px-6"
      style={{ left: "var(--sidenav-width)" }}
    >
      <TenureWordmark size={12} textClassName="text-text-3" />
      <p className="text-[11px] text-text-3">
        © {new Date().getFullYear()} Tenure. All rights reserved.
      </p>
    </footer>
  )
}
