/**
 * Roster values the specs assert on, taken from whatever roster seeded the
 * database rather than written down.
 *
 * These specs used to name real people — a real student's address as a search
 * term, a real predecessor's name as an expected string. That coupled the suite
 * to one institution's data in two ways that both went wrong at once: the tests
 * broke the moment the repository stopped publishing that data, and until then
 * the assertions were themselves a place real names lived in a public
 * repository. Deriving the values fixes both, and the assertions get stronger
 * rather than weaker — "the predecessor the roster records for this seat is on
 * the page" is the behaviour under test; that one particular person's name
 * appeared there was a coincidence of the fixture.
 *
 * Resolution mirrors scripts/roster-source.mjs — ROSTER_FILE, then the real
 * roster if it is present, then the committed synthetic fixture — so the specs
 * read the same people the seed wrote. The production guard is deliberately not
 * mirrored: that check exists to stop a real institution being seeded with
 * invented people, and a test run is neither.
 */
import { existsSync } from "node:fs"
import path from "node:path"

export interface RosterPerson {
  name: string
  email: string
}

interface RosterSeat {
  name: string
  positionCode?: string
  holder?: RosterPerson | null
  predecessor?: (RosterPerson & { term?: string }) | null
}

interface RosterClub {
  slug: string
  code: string
  name: string
  seats?: RosterSeat[]
}

let cached: Promise<{ ROSTER: RosterClub[]; ADVISORS: RosterPerson[] }> | null = null

function resolveRosterPath(): string {
  const here = path.join(__dirname, "..", "scripts")
  if (process.env.ROSTER_FILE) return path.resolve(process.env.ROSTER_FILE)
  const real = path.join(here, "roster-data.mjs")
  if (existsSync(real)) return real
  return path.join(here, "roster-data.sample.mjs")
}

async function roster() {
  if (!cached) {
    const file = resolveRosterPath()
    // A file URL, not a bare path: Playwright transpiles specs to CJS, and a
    // Windows drive letter in a dynamic import specifier is otherwise read as a
    // protocol.
    cached = import(`file://${file.replace(/\\/g, "/")}`)
  }
  return cached
}

/** The club the roster specs use, by slug. Throws loudly rather than returning undefined. */
export async function club(slug: string): Promise<RosterClub> {
  const { ROSTER } = await roster()
  const found = ROSTER.find((c) => c.slug === slug)
  if (!found) {
    throw new Error(
      `No club "${slug}" in the seeded roster. The specs and the roster disagree; ` +
        `check scripts/roster-source.mjs resolved the file you expect.`,
    )
  }
  return found
}

/** A seat on that club that records a previous holder, with that holder. */
export async function seatWithPredecessor(
  slug: string,
): Promise<{ seat: RosterSeat; predecessor: RosterPerson }> {
  const c = await club(slug)
  const seat = (c.seats ?? []).find((s) => s.predecessor?.name)
  if (!seat?.predecessor) {
    throw new Error(`No seat on "${slug}" records a predecessor, so there is nothing to assert.`)
  }
  return { seat, predecessor: seat.predecessor }
}

/**
 * Distinct directory people, for specs that assign and then transfer a seat.
 *
 * Picked by having an email whose local part is a usable search term, and
 * deduplicated by address — the roster lists a person once per seat they hold,
 * and assigning the same person twice would make a transfer assert nothing.
 */
export async function directoryPeople(count: number): Promise<RosterPerson[]> {
  const { ROSTER } = await roster()
  const seen = new Set<string>()
  const people: RosterPerson[] = []

  for (const c of ROSTER) {
    for (const seat of c.seats ?? []) {
      for (const person of [seat.holder, seat.predecessor]) {
        if (!person?.email || !person.name) continue
        const local = person.email.split("@")[0]
        // Long enough that the directory search narrows to one or two rows.
        if (local.length < 4) continue
        if (seen.has(person.email)) continue
        seen.add(person.email)
        people.push({ name: person.name, email: person.email })
        if (people.length === count) return people
      }
    }
  }

  throw new Error(
    `The seeded roster has ${people.length} usable directory people; this spec needs ${count}.`,
  )
}

/** The part of an address a directory search box can match on. */
export function searchTerm(person: RosterPerson): string {
  return person.email.split("@")[0]
}
