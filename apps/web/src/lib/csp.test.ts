import nextConfig from "../../next.config"
import {
  CSP_HEADER_NAME,
  CSP_MODE,
  buildContentSecurityPolicy,
  contentSecurityPolicyHeader,
} from "./csp"

/** Parse a serialised policy back into `directive -> sources` for readable assertions. */
function parse(policy: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const part of policy.split("; ")) {
    const [name, ...sources] = part.split(" ")
    out[name] = sources
  }
  return out
}

const prod = () => parse(buildContentSecurityPolicy({ dev: false }))
const dev = () => parse(buildContentSecurityPolicy({ dev: true }))

describe("buildContentSecurityPolicy — serialisation", () => {
  it("emits `name source source; name source` with no trailing separator", () => {
    const policy = buildContentSecurityPolicy({ dev: false })
    expect(policy).toMatch(/^[a-z-]+ [^;]+(; [a-z-]+ [^;]+)*$/)
    expect(policy.endsWith(";")).toBe(false)
  })

  it("never repeats a directive name", () => {
    // A duplicate is not a merge — browsers take the FIRST occurrence and drop
    // the rest, so a duplicated name silently discards whatever came later.
    const names = buildContentSecurityPolicy({ dev: false })
      .split("; ")
      .map((d) => d.split(" ")[0])
    expect(new Set(names).size).toBe(names.length)
  })
})

describe("buildContentSecurityPolicy — the directives SEC-008 asked for", () => {
  it("blocks plugin content, framing and <base> hijacking", () => {
    expect(prod()["object-src"]).toEqual(["'none'"])
    expect(prod()["frame-ancestors"]).toEqual(["'none'"])
    expect(prod()["base-uri"]).toEqual(["'self'"])
  })

  it("falls back to same-origin for everything not named", () => {
    expect(prod()["default-src"]).toEqual(["'self'"])
  })

  it("keeps injected forms on-origin", () => {
    expect(prod()["form-action"]).toEqual(["'self'"])
  })
})

describe("buildContentSecurityPolicy — what this app actually needs", () => {
  it("allows the inline scripts Next 15 and the theme script emit", () => {
    // The RSC payload arrives as inline <script>self.__next_f.push(…)</script>
    // and layout.tsx runs a pre-hydration theme script. Neither is nonced
    // without middleware.
    expect(prod()["script-src"]).toContain("'unsafe-inline'")
  })

  it("carries no script hash or nonce alongside 'unsafe-inline'", () => {
    // The trap this guards: under CSP3 a hash or nonce in script-src makes
    // browsers IGNORE 'unsafe-inline'. Hashing the theme script would therefore
    // break the framework's own inline scripts. If script-src ever grows a
    // nonce, the middleware that supplies it must land in the same change.
    const scriptSrc = prod()["script-src"].join(" ")
    expect(scriptSrc).not.toMatch(/'(sha256|sha384|sha512)-/)
    expect(scriptSrc).not.toMatch(/'nonce-/)
  })

  it("blocks inline event-handler attributes even though inline scripts are allowed", () => {
    // The containment that makes this policy worth shipping: `<img src=x
    // onerror=…>` in a previewed document is refused, while Next's inline
    // <script> elements still run.
    expect(prod()["script-src-attr"]).toEqual(["'none'"])
  })

  it("allows inline style attributes, which React style={{…}} props compile to", () => {
    expect(prod()["style-src"]).toContain("'unsafe-inline'")
  })

  it("allows the image sources the product actually renders", () => {
    // data: for mammoth's DOCX-embedded images, https: for the club logo and
    // profile picture URLs users paste into ClubImageEditor/ProfileImageEditor.
    expect(prod()["img-src"]).toEqual(["'self'", "data:", "https:"])
  })

  it("allows the presigned S3 host the PDF preview iframes", () => {
    expect(prod()["frame-src"]).toContain("https://*.amazonaws.com")
  })

  it("self-hosts fonts", () => {
    // next/font emits them into /_next/static at build; no external origin.
    expect(prod()["font-src"]).toEqual(["'self'", "data:"])
  })

  it("keeps client fetches same-origin in production", () => {
    // Every fetch() in src/components is a relative /api/… path. The Anthropic
    // call in src/lib/ai.ts is server-side and outside any browser policy.
    expect(prod()["connect-src"]).toEqual(["'self'"])
  })
})

describe("buildContentSecurityPolicy — dev-only relaxations", () => {
  it("allows eval for the dev bundler and React Refresh", () => {
    expect(dev()["script-src"]).toContain("'unsafe-eval'")
    expect(prod()["script-src"]).not.toContain("'unsafe-eval'")
  })

  it("allows the HMR websocket", () => {
    expect(dev()["connect-src"]).toContain("ws:")
    expect(prod()["connect-src"]).not.toContain("ws:")
  })

  it("relaxes nothing else", () => {
    const devPolicy = dev()
    const prodPolicy = prod()
    for (const name of Object.keys(prodPolicy)) {
      if (name === "script-src" || name === "connect-src") continue
      expect(devPolicy[name]).toEqual(prodPolicy[name])
    }
    expect(Object.keys(devPolicy)).toEqual(Object.keys(prodPolicy))
  })
})

describe("contentSecurityPolicyHeader", () => {
  it("ships report-only today", () => {
    // Deliberately pinned: flipping CSP_MODE must be a conscious edit that also
    // updates this test, not something that rides along in an unrelated change.
    // See the checklist on CSP_MODE for what has to be verified first.
    expect(CSP_MODE).toBe("report-only")
  })

  it("names the reporting header in report-only mode and the enforcing one otherwise", () => {
    expect(CSP_HEADER_NAME["report-only"]).toBe("Content-Security-Policy-Report-Only")
    expect(CSP_HEADER_NAME.enforce).toBe("Content-Security-Policy")
  })

  it("sends the same policy in both modes, so reports predict enforcement", () => {
    const reportOnly = contentSecurityPolicyHeader({ mode: "report-only", dev: false })
    const enforcing = contentSecurityPolicyHeader({ mode: "enforce", dev: false })
    expect(reportOnly.key).toBe("Content-Security-Policy-Report-Only")
    expect(enforcing.key).toBe("Content-Security-Policy")
    expect(reportOnly.value).toBe(enforcing.value)
  })
})

describe("next.config.ts wiring", () => {
  // A policy nobody serves is not a policy. This is the guard against the
  // header being dropped from securityHeaders while csp.ts stays behind, still
  // green and still doing nothing.
  it("serves the policy on every route, next to the headers that were already there", async () => {
    const routes = await nextConfig.headers!()
    const forEverything = routes.find((r) => r.source === "/(.*)")
    expect(forEverything).toBeDefined()

    const keys = forEverything!.headers.map((h) => h.key)
    expect(keys).toContain(CSP_HEADER_NAME[CSP_MODE])
    // The pre-existing five must survive the addition.
    expect(keys).toEqual(
      expect.arrayContaining([
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ])
    )

    // Whichever bundler this is being built for, the served value is the one
    // this module builds — next.config.ts adds no directives of its own.
    const value = forEverything!.headers.find((h) => h.key === CSP_HEADER_NAME[CSP_MODE])!.value
    expect([
      buildContentSecurityPolicy({ dev: true }),
      buildContentSecurityPolicy({ dev: false }),
    ]).toContain(value)
  })
})
