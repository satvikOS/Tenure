/**
 * A deterministic monogram avatar. The same name always yields the same hue, so
 * a person or club is recognisable at a glance across the product without
 * needing an uploaded image. Used for people, clubs, and directory rows.
 */

const HUES = [210, 262, 288, 152, 24, 340, 190, 128]

function hueFor(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
} as const

export function Avatar({
  name,
  imageUrl,
  size = "md",
  className,
}: {
  name: string
  imageUrl?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  const h = hueFor(name || "?")
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`${SIZES[size]} shrink-0 rounded-full border border-border object-cover ${className ?? ""}`}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={`${SIZES[size]} grid shrink-0 place-items-center rounded-full font-semibold ${className ?? ""}`}
      style={{
        background: `hsl(${h} 70% 92%)`,
        color: `hsl(${h} 62% 32%)`,
      }}
    >
      {initials(name)}
    </span>
  )
}
