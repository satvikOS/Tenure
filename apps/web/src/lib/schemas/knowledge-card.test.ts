import {
  CreatableCardTypeEnum,
  isRetiredCardType,
  knowledgeCardSchema,
  KnowledgeCardTypeEnum,
} from "./knowledge-card"

describe("knowledgeCardSchema", () => {
  it("validates a valid contact card", () => {
    const result = knowledgeCardSchema.safeParse({
      title: "IBM Sponsor Contact",
      type: "CONTACT",
      content: { name: "Jane Doe", email: "jane@ibm.com", phone: "+1 555-0100" },
    })
    expect(result.success).toBe(true)
  })

  it("rejects an empty title", () => {
    const result = knowledgeCardSchema.safeParse({
      title: "",
      type: "CONTACT",
      content: {},
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Title is required")
    }
  })

  it("rejects a title over 200 characters", () => {
    const result = knowledgeCardSchema.safeParse({
      title: "a".repeat(201),
      type: "PLAYBOOK",
      content: {},
    })
    expect(result.success).toBe(false)
  })

  it("rejects an invalid card type", () => {
    const result = knowledgeCardSchema.safeParse({
      title: "Test Card",
      type: "INVALID_TYPE",
      content: {},
    })
    expect(result.success).toBe(false)
  })

  it("accepts all valid card types", () => {
    // The creatable set, not every value the column can hold: CREDENTIAL is
    // retired and refused on purpose (see below).
    const types = CreatableCardTypeEnum.options
    for (const type of types) {
      const result = knowledgeCardSchema.safeParse({ title: "Test", type, content: {} })
      expect(result.success).toBe(true)
    }
  })

  it("accepts an optional roleId", () => {
    const withRole = knowledgeCardSchema.safeParse({
      title: "Annual Budget",
      type: "BUDGET",
      content: { total: 50000 },
      roleId: "cm0abc123def456ghi789jkl",
    })
    expect(withRole.success).toBe(true)
    const withoutRole = knowledgeCardSchema.safeParse({
      title: "Annual Budget",
      type: "BUDGET",
      content: { total: 50000 },
    })
    expect(withoutRole.success).toBe(true)
    // roleId must be a valid cuid if provided
    const withBadRole = knowledgeCardSchema.safeParse({
      title: "Annual Budget",
      type: "BUDGET",
      content: {},
      roleId: "not-a-cuid",
    })
    expect(withBadRole.success).toBe(false)
  })
})

describe("the retired CREDENTIAL type", () => {
  // MemoryRecord.content is an unencrypted Json column and any ACTIVE seat may
  // write one, so a type inviting people to store "login or access info" was a
  // shared plaintext password store. Creation is refused; the value survives so
  // rows already written still read.
  it("cannot be created", () => {
    const result = knowledgeCardSchema.safeParse({
      title: "Instagram login",
      type: "CREDENTIAL",
      content: { body: "user / hunter2" },
    })
    expect(result.success).toBe(false)
  })

  it("is absent from the creatable set but present in the stored set", () => {
    expect(CreatableCardTypeEnum.options).not.toContain("CREDENTIAL")
    expect(KnowledgeCardTypeEnum.options).toContain("CREDENTIAL")
  })

  it("every other type is still creatable", () => {
    for (const type of KnowledgeCardTypeEnum.options) {
      if (type === "CREDENTIAL") continue
      const result = knowledgeCardSchema.safeParse({ title: "Test", type, content: {} })
      expect(result.success).toBe(true)
    }
  })

  it("is recognised as retired, and live types are not", () => {
    expect(isRetiredCardType("CREDENTIAL")).toBe(true)
    expect(isRetiredCardType("PLAYBOOK")).toBe(false)
    // An unknown string is not "retired" — it is not ours at all, and treating it
    // as retired would withhold the body of anything unrecognised.
    expect(isRetiredCardType("NONSENSE")).toBe(false)
  })
})
