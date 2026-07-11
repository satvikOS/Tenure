import { CheckCircle } from "lucide-react"
import { ComingSoon } from "@/components/ComingSoon"

export default function ApprovalsPage() {
  return (
    <ComingSoon
      icon={CheckCircle}
      title="Approvals"
      description="Budget, event, and vendor requests flowing through the President → OSE approval chain, with full decision history."
      phase="Arriving next — Week 3 of the pilot build"
    />
  )
}
