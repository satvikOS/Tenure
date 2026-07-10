import { type ReactNode } from "react"

interface CardProps {
  children: ReactNode
  className?: string
  padding?: "none" | "sm" | "md" | "lg"
}

const paddingMap = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
}

export function Card({ children, className, padding = "md" }: CardProps) {
  return (
    <div
      className={`
        bg-surface rounded-lg border border-border shadow-sm
        ${paddingMap[padding]}
        ${className ?? ""}
      `}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-sm font-semibold text-text-1">{title}</h2>
        {subtitle && <p className="text-xs text-text-2 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// SAP Fiori "Object Attribute" — label / value pair
export function Attribute({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-3 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-text-1">{value ?? "—"}</span>
    </div>
  )
}
