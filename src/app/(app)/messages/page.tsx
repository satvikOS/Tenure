import { MessageSquare } from "lucide-react"
import { ComingSoon } from "@/components/ComingSoon"

export default function MessagesPage() {
  return (
    <ComingSoon
      icon={MessageSquare}
      title="Messages"
      description="Direct messages, board channels, and approval threads — conversations that persist across leadership transitions."
      phase="Week 5 of the pilot build"
    />
  )
}
