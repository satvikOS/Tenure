import { CreatableCardTypeEnum, KnowledgeCardTypeEnum } from "./knowledge-card"
import fs from "node:fs"
import path from "node:path"

/**
 * The e2e suite must only pick card types the form still offers.
 *
 * `0d6ac13` retired CREDENTIAL from `CreatableCardTypeEnum` — correctly: the
 * content column is unencrypted Json, any ACTIVE seat can write one, and search
 * indexes it as plain text, so a type called "Credential" invited people to
 * paste passwords into a shared database. But the option vanished from the
 * dropdown while `search-reports.spec.ts` still selected it, so
 * `selectOption` waited out its 45-second timeout on a value that no longer
 * existed, and `main` went red.
 *
 * A unit test catches that in seconds instead of a full browser run, and — more
 * usefully — it fails at the moment the type is retired rather than after the
 * next e2e run, which is when the person doing the retiring is still looking at
 * it.
 */
const E2E_DIR = path.join(__dirname, "..", "..", "..", "e2e")

function specFiles(): string[] {
  return fs
    .readdirSync(E2E_DIR)
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => path.join(E2E_DIR, f))
}

describe("creatable card types", () => {
  it("is a subset of what the database can store", () => {
    // Retiring a type must not orphan the rows already written with it.
    for (const type of CreatableCardTypeEnum.options) {
      expect(KnowledgeCardTypeEnum.options).toContain(type)
    }
  })

  it("still excludes CREDENTIAL", () => {
    // A secret needs a vault: per-secret grants, rotation, revocation, masking
    // and access logging. Until Tenure has one, the honest thing is not to ask
    // for the secret at all.
    expect(CreatableCardTypeEnum.options).not.toContain("CREDENTIAL")
    expect(KnowledgeCardTypeEnum.options).toContain("CREDENTIAL")
  })

  it("no e2e spec selects a card type that is stored but no longer creatable", () => {
    // Precision matters more than reach here. `getByLabel("Type")` is not
    // unique to the memory form — resources.spec.ts drives a resource-type
    // dropdown with the same label and values like FORM and GUIDE, and a
    // looser check reported those as retired card types, which they never were.
    //
    // The real condition is narrower and exactly describes the bug: a value the
    // DATABASE still stores but the form no longer offers. FORM and GUIDE are
    // in neither enum, so they are correctly ignored; CREDENTIAL is in one and
    // not the other, which is the whole failure mode.
    const stored = new Set<string>(KnowledgeCardTypeEnum.options)
    const creatable = new Set<string>(CreatableCardTypeEnum.options)
    const retired = [...stored].filter((t) => !creatable.has(t))

    const offenders: string[] = []
    for (const file of specFiles()) {
      const text = fs.readFileSync(file, "utf8")
      for (const m of text.matchAll(/getByLabel\(\s*"Type"\s*\)\s*\.selectOption\(\s*"([A-Z_]+)"/g)) {
        if (retired.includes(m[1])) {
          offenders.push(
            `${path.basename(file)} selects "${m[1]}", which is stored but no longer creatable`,
          )
        }
      }
    }

    expect(retired.length).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})
