import { createHmac, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { AppError } from "../common/errors";
import { AppConfig } from "../config/config.module";
import type { ImageType } from "./images";

export interface PresignedUpload {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export interface StoredObject {
  size: number;
  contentType: string;
}

/** How long a signed upload URL stays valid. */
const UPLOAD_TTL_SECONDS = 10 * 60;

/**
 * Stores uploaded images. Browsers upload straight to storage with a signed
 * URL, so image bytes never pass through the API in production. The signature
 * covers the exact type and size, so the upload can't be swapped for something else.
 */
@Injectable()
export class StorageService {
  private readonly s3?: S3Client;
  private readonly bucket?: string;
  private readonly signingKey: Buffer;
  readonly driver: "local" | "s3";
  readonly uploadDir: string;

  constructor(private readonly config: AppConfig) {
    this.driver = config.get("STORAGE_DRIVER");
    this.uploadDir = path.resolve(config.get("UPLOAD_DIR"));
    this.signingKey = createHmac("sha256", config.get("JWT_SECRET")).update("uploads").digest();
    if (this.driver === "s3") {
      this.bucket = config.get("S3_BUCKET");
      this.s3 = new S3Client({
        region: config.get("S3_REGION"),
        endpoint: config.get("S3_ENDPOINT"),
        forcePathStyle: config.get("S3_FORCE_PATH_STYLE"),
        credentials: {
          accessKeyId: config.get("S3_ACCESS_KEY_ID")!,
          secretAccessKey: config.get("S3_SECRET_ACCESS_KEY")!,
        },
      });
    }
  }

  publicUrl(key: string): string {
    return `${this.config.get("MEDIA_BASE_URL").replace(/\/$/, "")}/${key}`;
  }

  async presignPut(key: string, contentType: ImageType, size: number, now = new Date()): Promise<PresignedUpload> {
    const expiresAt = new Date(now.getTime() + UPLOAD_TTL_SECONDS * 1000);
    const headers = { "Content-Type": contentType };
    if (this.s3) {
      const url = await getSignedUrl(
        this.s3,
        new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: size }),
        { expiresIn: UPLOAD_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
      );
      return { url, method: "PUT", headers, expiresAt: expiresAt.toISOString() };
    }
    const exp = Math.floor(expiresAt.getTime() / 1000);
    const q = new URLSearchParams({ key, type: contentType, size: String(size), exp: String(exp) });
    q.set("sig", this.sign(key, contentType, size, exp));
    return { url: `/v1/uploads/local?${q}`, method: "PUT", headers, expiresAt: expiresAt.toISOString() };
  }

  async head(key: string): Promise<StoredObject | null> {
    if (this.s3) {
      try {
        const res = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? "" };
      } catch (e) {
        if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    }
    try {
      const st = await stat(this.localPath(key));
      return { size: st.size, contentType: contentTypeOf(key) };
    } catch {
      return null;
    }
  }

  /** The first bytes of an object, to check what it really is. */
  async readStart(key: string, bytes: number): Promise<Buffer> {
    if (this.s3) {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
      return Buffer.from(await res.Body!.transformToByteArray());
    }
    const fh = await open(this.localPath(key), "r");
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  }

  async delete(key: string) {
    if (this.s3) await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    else await rm(this.localPath(key), { force: true });
  }

  /** Local driver: receives an upload signed by presignPut. */
  async receiveLocal(
    params: { key?: string; type?: string; size?: string; exp?: string; sig?: string },
    headers: { contentType?: string; contentLength?: string },
    body: Readable,
    now = new Date(),
  ) {
    const { key = "", type = "", sig = "" } = params;
    const size = Number(params.size);
    const exp = Number(params.exp);
    const expected = this.sign(key, type, size, exp);
    const valid =
      sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) && exp * 1000 > now.getTime();
    if (!valid) throw new AppError(403, "upload_not_allowed", "This upload link is not valid or has expired.");
    if (headers.contentType !== type || Number(headers.contentLength) !== size) {
      throw new AppError(400, "upload_mismatch", "The file doesn't match what the upload was signed for.");
    }
    const dest = this.localPath(key);
    await mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.${process.pid}.part`;
    let received = 0;
    body.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > size) body.destroy(new AppError(413, "upload_too_large", "The file is larger than declared."));
    });
    try {
      await pipeline(body, createWriteStream(tmp));
      if (received !== size) throw new AppError(400, "upload_mismatch", "The upload was cut short.");
      await rename(tmp, dest);
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }

  private sign(key: string, type: string, size: number, exp: number) {
    return createHmac("sha256", this.signingKey).update(`${key}\n${type}\n${size}\n${exp}`).digest("base64url");
  }

  /** Keys are generated by the API, but still never allowed to leave the upload folder. */
  private localPath(key: string) {
    const full = path.resolve(this.uploadDir, key);
    if (!full.startsWith(this.uploadDir + path.sep)) throw new AppError(400, "bad_key", "Invalid file key.");
    return full;
  }
}

function contentTypeOf(key: string) {
  const ext = key.split(".").pop();
  return { png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp" }[ext ?? ""] ?? "application/octet-stream";
}
