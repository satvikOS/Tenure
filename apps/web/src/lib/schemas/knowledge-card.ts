import { z } from "zod"

/**
 * Every type the database can hold, including ones no longer offered.
 *
 * Kept complete so existing rows still read. Removing a value from the Prisma
 * enum would need a migration that fails while any row uses it, and dropping
 * those rows is not a decision a schema change gets to make.
 */
export const KnowledgeCardTypeEnum = z.enum([
  "CONTACT",
  "PLAYBOOK",
  "BUDGET",
  "VENDOR",
  "LESSON",
  "THREAD",
  "CREDENTIAL",
  "DEADLINE",
])

export type KnowledgeCardType = z.infer<typeof KnowledgeCardTypeEnum>

/**
 * Types a person may still create. CREDENTIAL is deliberately absent.
 *
 * `MemoryRecord.content` is an unencrypted Json column, any ACTIVE seat may
 * write one — including a plain member — and the card is indexed for search and
 * rendered as ordinary text to everyone who can see the record. Offering a type
 * called "Credential — Login or access info" against that storage invited people
 * to paste passwords into a shared database, and the schema comment claiming it
 * was "stored encrypted" described a control that was never written.
 *
 * A secret needs a vault: per-secret grants, rotation, revocation, masking and
 * access logging. Until Tenure has one to point at, the honest thing is not to
 * ask for the secret at all. The operating context around a credential — what it
 * unlocks, who owns it, how to get it rotated — is a PLAYBOOK, and always was.
 */
export const CreatableCardTypeEnum = z.enum([
  "CONTACT",
  "PLAYBOOK",
  "BUDGET",
  "VENDOR",
  "LESSON",
  "THREAD",
  "DEADLINE",
])

export type CreatableCardType = z.infer<typeof CreatableCardTypeEnum>

/** True for a stored type that can no longer be authored. */
export function isRetiredCardType(type: string): boolean {
  return KnowledgeCardTypeEnum.options.includes(type as KnowledgeCardType) &&
    !CreatableCardTypeEnum.options.includes(type as CreatableCardType)
}

export const knowledgeCardSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title must be 200 characters or fewer"),
  type: CreatableCardTypeEnum,
  content: z.record(z.unknown()),
  roleId: z.string().cuid().optional(),
})

export type KnowledgeCardInput = z.infer<typeof knowledgeCardSchema>
