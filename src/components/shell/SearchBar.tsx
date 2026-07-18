import Link from "next/link"
import { Search } from "lucide-react"

/**
 * Global search, promoted out of the side nav into the header where Workday and
 * Jira both keep it. On wide screens it is a real input that GETs to /search;
 * on narrow screens it collapses to an icon that opens the search page, so the
 * header never overflows.
 */
export function SearchBar() {
  return (
    <>
      <form
        action="/search"
        method="get"
        role="search"
        className="hidden sm:block w-56 lg:w-72"
      >
        <div
          className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-[--primary]"
          style={{
            background: "var(--shell-item-hover)",
            border: "1px solid var(--shell-border)",
            color: "var(--shell-text-secondary)",
          }}
        >
          <Search size={16} className="shrink-0" />
          <input
            name="q"
            placeholder="Search Tenure…"
            aria-label="Search Tenure"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[--shell-text-secondary]"
          />
        </div>
      </form>

      {/* Narrow screens: an icon that opens the full search page */}
      <Link
        href="/search"
        aria-label="Search Tenure"
        className="grid h-10 w-10 place-items-center rounded-lg text-[--shell-text-secondary] no-underline transition-colors hover:bg-[--shell-item-hover] hover:text-white sm:hidden"
      >
        <Search size={18} />
      </Link>
    </>
  )
}
