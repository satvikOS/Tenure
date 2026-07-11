import { Calendar } from "lucide-react"
import { ComingSoon } from "@/components/ComingSoon"

export default function CalendarPage() {
  return (
    <ComingSoon
      icon={Calendar}
      title="Calendar"
      description="Shared event calendar across every club with automatic conflict detection and approval-linked publishing."
      phase="Week 4 of the pilot build"
    />
  )
}
