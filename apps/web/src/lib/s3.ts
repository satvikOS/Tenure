import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import {
  contentDispositionAttachment,
  isInlineSafeContentType,
  safeContentTypeForKey,
  safeServedContentType,
} from "@/lib/uploads"

// Uses the ECS task role in production; local dev needs AWS_* env vars.
const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" })

export const documentsBucket = process.env.S3_DOCUMENTS_BUCKET

/** True when document storage is configured (unset in CI e2e). */
export function storageConfigured(): boolean {
  return !!documentsBucket
}

/**
 * Fetch a stored object's raw bytes, reusing the shared S3 client (callers
 * should never construct their own). Access must be permission-checked first.
 */
export async function getDocumentBytes(key: string): Promise<Buffer> {
  if (!documentsBucket) throw new Error("Document storage is not configured")
  const obj = await s3.send(new GetObjectCommand({ Bucket: documentsBucket, Key: key }))
  return Buffer.from(await obj.Body!.transformToByteArray())
}

export async function uploadDocument(key: string, body: Buffer, contentType: string) {
  if (!documentsBucket) throw new Error("Document storage is not configured")
  await s3.send(
    new PutObjectCommand({
      Bucket: documentsBucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    })
  )
}

/**
 * Short-lived download link — access is checked before generating it.
 *
 * The response headers are overridden rather than inherited: the type S3 stored
 * at PUT time may predate upload validation and be whatever a client claimed,
 * so `safeServedContentType` re-decides it here too. A presigned GET is served
 * by S3, not by this app, so the app's `nosniff` header does not apply to it —
 * which is why the disposition is always `attachment`.
 */
export async function documentDownloadUrl(
  key: string,
  filename: string,
  storedMimeType?: string | null
) {
  if (!documentsBucket) throw new Error("Document storage is not configured")
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: documentsBucket,
      Key: key,
      ResponseContentType: safeServedContentType(storedMimeType),
      ResponseContentDisposition: contentDispositionAttachment(filename),
    }),
    { expiresIn: 600 }
  )
}

/**
 * Short-lived inline link — opens in the browser instead of downloading, which
 * is how the viewer embeds PDFs and images.
 *
 * `inline` is only granted to a Content-Type the allowlist vouches for. Callers
 * that own a `mimeType` column pass it; those that do not (profile pictures,
 * club logos) get it derived from the key's extension. Anything else is served
 * opaque and as an attachment, so a stored HTML payload cannot be navigated to
 * and rendered.
 */
export async function documentViewUrl(key: string, storedMimeType?: string | null) {
  if (!documentsBucket) throw new Error("Document storage is not configured")
  const contentType = storedMimeType
    ? safeServedContentType(storedMimeType)
    : safeContentTypeForKey(key)
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: documentsBucket,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: isInlineSafeContentType(contentType)
        ? "inline"
        : contentDispositionAttachment(key.split("/").pop() ?? "download"),
    }),
    { expiresIn: 600 }
  )
}
