import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getUserContext } from "@/lib/rbac"
import { canReadConversation } from "@/lib/messaging"
import { getDocumentBytes } from "@/lib/s3"
import { contentDispositionAttachment, safeServedContentType } from "@/lib/uploads"

/**
 * Downloads a message attachment, but only for someone allowed to read the
 * conversation it belongs to.
 *
 * The bytes are streamed through this route rather than handed off with a
 * presigned S3 URL, because the headers are the point: S3 cannot be made to
 * send `X-Content-Type-Options`, so an object stored before upload validation
 * (mimeType = whatever the client claimed) could be navigated to and rendered
 * as HTML. Served from here it gets a vouched-for Content-Type, `nosniff`, and
 * an `attachment` disposition — three independent reasons a browser will not
 * render it inline. Attachments are capped at MAX_UPLOAD_BYTES, so buffering
 * one is bounded.
 */
export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 })

  const att = await db.attachment.findUnique({
    where: { id },
    include: {
      message: {
        include: {
          conversation: { include: { participants: { select: { userId: true } } } },
        },
      },
    },
  })
  if (!att) return new NextResponse("Not found", { status: 404 })

  const convo = att.message.conversation
  const ctx = await getUserContext(session.user.id)
  const allowed = canReadConversation(ctx, {
    type: convo.type,
    institutionId: convo.institutionId,
    organizationId: convo.organizationId,
    participantUserIds: convo.participants.map((p) => p.userId),
  })
  if (!allowed) return new NextResponse("Forbidden", { status: 403 })

  let bytes: Buffer
  try {
    bytes = await getDocumentBytes(att.objectKey)
  } catch {
    return new NextResponse("This attachment could not be retrieved", { status: 502 })
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": safeServedContentType(att.mimeType),
      "Content-Disposition": contentDispositionAttachment(att.fileName),
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      // Attachments are conversation-scoped; a shared cache must never hold one.
      "Cache-Control": "private, no-store",
    },
  })
}
