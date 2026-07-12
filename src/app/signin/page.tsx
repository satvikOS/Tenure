import { redirect } from "next/navigation"
import { auth, signIn } from "@/lib/auth"
import { TenureLogo, TenureWordmark } from "@/components/brand/TenureLogo"

const DEMO_USERS = [
  { email: "director@tenure.demo", name: "Dana Whitfield", role: "OSE Director" },
  { email: "staff@tenure.demo", name: "Sam Ortiz", role: "OSE Staff" },
  { email: "president@tenure.demo", name: "Priya Raman", role: "President · Consulting Club" },
  { email: "vp.finance@tenure.demo", name: "Victor Chen", role: "VP Finance · Consulting Club" },
  { email: "member@tenure.demo", name: "Maya Johnson", role: "Member · Consulting Club" },
  { email: "incoming.president@tenure.demo", name: "Isaiah Brooks", role: "Incoming President (Shadow)" },
  { email: "alumni@tenure.demo", name: "Alex Kim", role: "Past President (Alumni)" },
]

export default async function SignInPage() {
  const session = await auth()
  if (session?.user) redirect("/dashboard")

  const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "true"

  async function devSignIn(formData: FormData) {
    "use server"
    await signIn("dev-login", {
      email: formData.get("email"),
      redirectTo: "/dashboard",
    })
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--shell-bg)" }}
    >
      <div className="w-full max-w-md rounded-lg bg-white shadow-lg p-8">
        <div className="flex items-center gap-2.5">
          <TenureLogo size={26} color="#1c8c5a" />
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tenure</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Institutional knowledge that survives every leadership transition.
        </p>

        {devLoginEnabled ? (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Pilot demo — sign in as
            </p>
            <ul className="space-y-2">
              {DEMO_USERS.map((u) => (
                <li key={u.email}>
                  <form action={devSignIn}>
                    <input type="hidden" name="email" value={u.email} />
                    <button
                      type="submit"
                      className="w-full text-left rounded-md border border-gray-200 px-4 py-2.5 hover:border-[var(--primary)] hover:bg-blue-50 transition-colors"
                    >
                      <span className="block text-sm font-medium text-gray-900">{u.name}</span>
                      <span className="block text-xs text-gray-500">{u.role}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-6 text-sm text-gray-600">
            Sign in with your university account via your institution&apos;s SSO portal.
          </p>
        )}
      </div>
      <div className="mt-8 flex flex-col items-center gap-1.5">
        <TenureWordmark size={14} textClassName="text-white/80" />
        <p className="text-xs text-white/50">
          © {new Date().getFullYear()} Tenure. All rights reserved.
        </p>
      </div>
    </main>
  )
}
