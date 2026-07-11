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

export async function synthesizeAnswer(
  question: string,
  sources: ScoredDoc[]
): Promise<string | null> {
  if (!aiConfigured() || sources.length === 0) return null

  const sourceBlock = sources
    .map((s, i) => `[${i + 1}] (${s.kind} · ${s.context}) ${s.title}\n${s.body.slice(0, 1200)}`)
    .join("\n\n")

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
        max_tokens: 500,
        system:
          "You answer questions for student-organization leaders using ONLY the numbered sources provided. " +
          "Cite every claim with its source number in brackets, e.g. [1]. " +
          "If the sources do not contain the answer, say so briefly. Never invent facts.",
        messages: [
          {
            role: "user",
            content: `Question: ${question}\n\nSources:\n${sourceBlock}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { content?: { type: string; text?: string }[] }
    const text = data.content?.find((b) => b.type === "text")?.text
    return text ?? null
  } catch {
    return null // Search results still render — generation is best-effort
  }
}
