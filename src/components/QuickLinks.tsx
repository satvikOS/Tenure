import Link from "next/link"
import { ArrowRight, ExternalLink } from "lucide-react"
import { Card, CardHeader } from "@/components/ui/Card"
import { resourcesForSeats, type SeatKey } from "@/lib/resources"

/**
 * The handful of links a board member opens constantly, on the first page
 * they land on. Personalized to the seats they hold, so a VP Finance sees the
 * expense form and a VP Events sees the flyer process.
 */
export function QuickLinks({ seats }: { seats: SeatKey[] }) {
  const links = resourcesForSeats(seats)
    .filter((r) => r.ready)
    .slice(0, 8)
  if (links.length === 0) return null

  return (
    <Card>
      <CardHeader
        title="Quick links"
        subtitle="Forms, tools and policies for the seats you hold."
        action={
          <Link
            href="/resources"
            className="inline-flex items-center gap-1 text-xs font-medium text-[--text-link] no-underline hover:underline"
          >
            All resources <ArrowRight size={12} />
          </Link>
        }
      />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {links.map((r) => {
          const content = (
            <>
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              {r.external ? (
                <ExternalLink size={12} className="shrink-0 text-text-3" aria-hidden />
              ) : (
                <ArrowRight size={12} className="shrink-0 text-text-3" aria-hidden />
              )}
            </>
          )
          const className =
            "flex items-center gap-2 rounded border border-border px-3 py-2 text-xs font-medium text-text-1 no-underline transition-colors hover:border-[--primary] hover:bg-base"

          return (
            <li key={r.id}>
              {r.external ? (
                <a
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={className}
                >
                  {content}
                </a>
              ) : (
                <Link href={r.href} className={className}>
                  {content}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
