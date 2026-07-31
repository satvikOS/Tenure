/**
 * Truncation that admits it truncated. Pure, so server pages can fold a series
 * before serialising it to a client chart.
 */

/**
 * Keep the `limit` heaviest rows and fold the rest into one explicit row.
 *
 * A chart that silently `.slice(0, N)`s its dataset lies twice: the bars imply
 * they are the whole picture, and their total stops reconciling with the KPI
 * tile above them — the reports roster chart drew 8 of 78 board-position
 * categories beside a "Filled seats" tile counting seats from all 78. Folding
 * the tail into a labelled "Other" row keeps the chart readable AND the
 * arithmetic true.
 *
 * Returns the rows sorted heaviest-first. When there is nothing to fold the
 * input is returned sorted and unchanged, so callers can detect the folded row
 * rather than assuming one exists.
 */
export function topNWithOther<T>(
  rows: T[],
  limit: number,
  opts: {
    /** Ranking weight — rows are ordered by this, descending. */
    weight: (row: T) => number
    /** Build the single folded row from the tail and its label. */
    fold: (tail: T[], label: string) => T
    /** Label for the folded row. Defaults to "Other (N more)". */
    label?: (foldedCount: number) => string
  }
): T[] {
  const sorted = [...rows].sort((a, b) => opts.weight(b) - opts.weight(a))
  if (limit < 0 || sorted.length <= limit) return sorted

  const tail = sorted.slice(limit)
  const label = (opts.label ?? ((n: number) => `Other (${n} more)`))(tail.length)
  return [...sorted.slice(0, limit), opts.fold(tail, label)]
}
