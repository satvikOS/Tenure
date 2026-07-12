import { TenureWordmark } from "@/components/brand/TenureLogo"

export function Footer() {
  return (
    <footer className="mt-12 border-t border-border pt-6 pb-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <TenureWordmark size={16} textClassName="text-text-2" />
      <p className="text-xs text-text-3">
        © {new Date().getFullYear()} Tenure. All rights reserved.
      </p>
    </footer>
  )
}
