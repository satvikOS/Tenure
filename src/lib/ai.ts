import type { ScoredDoc } from "@/lib/search"

/**
 * Answer synthesis over retrieved, permission-filtered sources.
 * Uses the Anthropic API when ANTHROPIC_API_KEY is configured; otherwise
 * the caller falls back to showing cited sources without a prose answer.
 * The model only ever sees content the requesting user is allowed to see.
 */
export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

/** Generic best-effort completion — Tenure AI's single entry point. */
export async function aiComplete(
  system: string,
  user: string,
  maxTokens = 500
): Promise<string | null> {
  if (!aiConfigured()) return null
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    return data.content?.find((b) => b.type === "text")?.text ?? null
  } catch {
    return null // Callers degrade gracefully — generation is best-effort
  }
}

export async function synthesizeAnswer(
  question: string,
  sources: ScoredDoc[]
): Promise<string | null> {
  if (sources.length === 0) return null
  const sourceBlock = sources
    .map((s, i) => `[${i + 1}] (${s.kind} · ${s.context}) ${s.title}\n${s.body.slice(0, 1200)}`)
    .join("\n\n")
  return aiComplete(
    "You answer questions for student-organization leaders using ONLY the numbered sources provided. " +
      "Cite every claim with its source number in brackets, e.g. [1]. " +
      "If the sources do not contain the answer, say so briefly. Never invent facts.",
    `Question: ${question}\n\nSources:\n${sourceBlock}`
  )
}

export async function draftText(
  kind: "message" | "memory" | "event",
  instruction: string
): Promise<string | null> {
  const contexts = {
    message: "a professional message between student-organization leaders",
    memory: "an institutional-memory knowledge card a successor will rely on — concrete details, names, amounts, dates",
    event: "an event description for a university club calendar",
  }
  return aiComplete(
    `You are Tenure AI, the copilot inside Tenure (an operating system for student organizations). ` +
      `Draft ${contexts[kind]}. Return ONLY the drafted text — no preamble, no quotes, no markdown headers. Be concise and specific.`,
    instruction,
    400
  )
}

export async function summarizeDocument(
  title: string,
  content: string
): Promise<string | null> {
  return aiComplete(
    "You are Tenure AI. Summarize this club document for a busy student leader: " +
      "3-6 bullet points covering purpose, key facts (names, amounts, dates, deadlines), and any action items. Plain text bullets.",
    `Document: ${title}\n\n${content.slice(0, 24_000)}`,
    600
  )
}
