import { TenureWordmark } from "@/components/brand/TenureLogo"

/**
 * Deliberately quiet, following the Workday pattern: the footer is a legal
 * and orientation marker, not a brand moment. It should recede on every page
 * the user actually works in.
 */
export function Footer() {
  return (
    <footer className="mt-10 flex flex-col items-center justify-between gap-1.5 border-t border-border pt-3 pb-3 sm:flex-row">
      <TenureWordmark size={11} textClassName="text-text-3" />
      <p className="text-[11px] text-text-3">
        © {new Date().getFullYear()} Tenure. All rights reserved.
      </p>
    </footer>
  )
}
