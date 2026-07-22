/**
 * Deterministic per-club calendar colour. A club always maps to the same hue,
 * so a club's events read consistently across the time grid and the "My
 * calendars" rail (the Outlook pattern: colour follows the calendar). Shared by
 * the client time-grid and the server-rendered sidebar so the two never drift.
 */
const CLUB_HUES = [210, 262, 288, 152, 24, 340, 190, 128]

export function clubHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return CLUB_HUES[h % CLUB_HUES.length]
}

/** The event-chip fill / border / ink for a club, from its hue. */
export function clubSwatch(seed: string): { bg: string; border: string; text: string } {
  const h = clubHue(seed)
  return { bg: `hsl(${h} 24% 94%)`, border: `hsl(${h} 30% 45%)`, text: `hsl(${h} 32% 28%)` }
}
