import { Card } from "@/components/ui/Card"
import { resourcesForSeats, type SeatKey } from "@/lib/resources"
import { QuickLinksRotator } from "./QuickLinksRotator"

/**
 * The handful of links a board member opens constantly, on the first page they
 * land on, personalized to the seats they hold. Kept compact: the client
 * rotator pages through them rather than listing them all at once.
 */
export function QuickLinks({ seats }: { seats: SeatKey[] }) {
  const links = resourcesForSeats(seats)
    .filter((r) => r.ready)
    .slice(0, 12)
    .map((r) => ({ id: r.id, title: r.title, href: r.href, external: Boolean(r.external) }))
  if (links.length === 0) return null

  return (
    <Card className="max-w-xl">
      <QuickLinksRotator links={links} />
    </Card>
  )
}
