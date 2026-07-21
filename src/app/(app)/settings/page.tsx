import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { storageConfigured } from "@/lib/s3"
import { Card, CardHeader, Attribute } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { PageHeader } from "@/components/ui/PageHeader"
import { ThemeSwitcher } from "@/components/ThemeSwitcher"
import { ProfileImageEditor } from "@/components/ProfileImageEditor"
import { updateProfile } from "./actions"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/signin")

  const [user, ctx] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id } }),
    getUserContext(session.user.id),
  ])
  if (!user) redirect("/signin")

  const seats = await db.roleAssignment.findMany({
    where: { userId: user.id, status: { in: ["ACTIVE", "SHADOW"] } },
    include: { role: { include: { organization: { select: { name: true } } } } },
    orderBy: { startDate: "desc" },
  })

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="Your profile, appearance, and access at a glance."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Profile picture"
            subtitle="Shown in the header, messages, and wherever you appear."
          />
          <ProfileImageEditor
            name={user.name ?? user.email ?? "You"}
            image={user.image}
            canUpload={storageConfigured()}
          />
        </Card>

        <Card>
          <CardHeader
            title="Appearance"
            subtitle="Choose a theme — System follows your device."
          />
          <ThemeSwitcher />
        </Card>

        <Card>
          <CardHeader title="Profile" />
          <form action={updateProfile} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-text-2 flex-1 min-w-52">
              Display name
              <input
                name="name"
                defaultValue={user.name ?? ""}
                required
                maxLength={120}
                className="h-9 w-full rounded border border-border px-3 text-sm text-text-1 bg-surface"
              />
            </label>
            <button className="h-9 rounded bg-[--primary] px-4 text-sm font-medium text-white hover:opacity-90">
              Save
            </button>
          </form>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Attribute label="Email" value={user.email} />
            <Attribute
              label="Institution role"
              value={
                ctx.institutionRoles[0]
                  ? ctx.institutionRoles[0].role.replace(/_/g, " ").toLowerCase()
                  : "club member"
              }
            />
          </div>
        </Card>

        <Card padding="none">
          <div className="p-5 border-b border-border">
            <CardHeader
              title="Your seats"
              subtitle="Positions you currently hold or are inheriting"
            />
          </div>
          {seats.length === 0 ? (
            <p className="px-5 py-6 text-sm text-text-3 text-center">No club seats.</p>
          ) : (
            <ul className="divide-y divide-border">
              {seats.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-1">
                      {s.role.name} · {s.role.organization.name}
                    </p>
                    {s.role.positionCode && (
                      <p className="text-xs text-text-3 mt-0.5">
                        Position ID {s.role.positionCode}
                      </p>
                    )}
                  </div>
                  <Badge variant={s.status === "ACTIVE" ? "success" : "info"}>
                    {s.status === "ACTIVE" ? "Active" : "Shadow"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Notifications" subtitle="Delivery preferences" />
          <p className="text-sm text-text-2">
            In-app notifications are always on. Email digests arrive with the
            university SSO rollout.
          </p>
        </Card>
      </div>
    </div>
  )
}
