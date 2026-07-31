import { topNWithOther } from "./topn"

/**
 * A chart that quietly `.slice(0, N)`s its data claims completeness it does not
 * have — the reports roster chart drew 8 of 78 board-position categories with
 * no hint that 70 were missing. Folding the tail keeps the totals true.
 */

type Row = { category: string; filled: number; vacant: number }

const row = (category: string, filled: number, vacant: number): Row => ({
  category,
  filled,
  vacant,
})

const fold = (tail: Row[], label: string): Row => ({
  category: label,
  filled: tail.reduce((n, r) => n + r.filled, 0),
  vacant: tail.reduce((n, r) => n + r.vacant, 0),
})

const opts = { weight: (r: Row) => r.filled + r.vacant, fold }

describe("topNWithOther", () => {
  it("sorts heaviest first", () => {
    const out = topNWithOther([row("a", 1, 0), row("b", 5, 0), row("c", 3, 0)], 3, opts)
    expect(out.map((r) => r.category)).toEqual(["b", "c", "a"])
  })

  it("adds no Other row when everything already fits", () => {
    const rows = [row("a", 2, 1), row("b", 1, 1)]
    const out = topNWithOther(rows, 5, opts)
    expect(out).toHaveLength(2)
    expect(out.map((r) => r.category)).toEqual(["a", "b"])
  })

  it("folds the tail into one labelled row instead of dropping it", () => {
    const rows = [row("a", 10, 0), row("b", 8, 0), row("c", 3, 1), row("d", 2, 2)]
    const out = topNWithOther(rows, 2, opts)
    expect(out.map((r) => r.category)).toEqual(["a", "b", "Other (2 more)"])
    expect(out[2]).toMatchObject({ filled: 5, vacant: 3 })
  })

  it("conserves the total — the whole point of folding rather than slicing", () => {
    const rows = Array.from({ length: 78 }, (_, i) => row(`cat${i}`, i, 1))
    const total = (rs: Row[]) => rs.reduce((n, r) => n + r.filled + r.vacant, 0)
    expect(total(topNWithOther(rows, 8, opts))).toBe(total(rows))
  })

  it("takes a caller-supplied label so the chart can name the remainder", () => {
    const rows = [row("a", 4, 0), row("b", 2, 0), row("c", 1, 0)]
    const out = topNWithOther(rows, 1, { ...opts, label: (n) => `Other (${n} categories)` })
    expect(out[1].category).toBe("Other (2 categories)")
  })

  it("folds everything when the limit is zero rather than returning nothing", () => {
    const out = topNWithOther([row("a", 1, 0), row("b", 2, 0)], 0, opts)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ filled: 3, vacant: 0 })
  })

  it("leaves an empty dataset empty — no Other bucket for nothing", () => {
    expect(topNWithOther([], 8, opts)).toEqual([])
  })

  it("does not mutate the caller's array", () => {
    const rows = [row("a", 1, 0), row("b", 5, 0)]
    topNWithOther(rows, 1, opts)
    expect(rows.map((r) => r.category)).toEqual(["a", "b"])
  })
})
