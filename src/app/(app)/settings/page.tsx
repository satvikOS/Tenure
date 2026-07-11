import { Settings } from "lucide-react"
import { ComingSoon } from "@/components/ComingSoon"

export default function SettingsPage() {
  return (
    <ComingSoon
      icon={Settings}
      title="Settings"
      description="Profile, notification preferences, and institution administration."
      phase="Later in the pilot build"
    />
  )
}
