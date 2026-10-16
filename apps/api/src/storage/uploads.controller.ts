import { randomUUID } from "node:crypto";
import { Body, Controller, HttpCode, Post, Put, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { z } from "zod";
import { Auth, Public, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { AppError, ProblemSchema } from "../common/errors";
import { ApiZodBody, ApiZodResponse, named, zod } from "../common/zod";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "./images";
import type { ImageType } from "./images";
import { StorageService } from "./storage.service";

export const CreateUploadRequest = named(
  "CreateUploadRequest",
  z.object({
    contentType: z.enum(Object.keys(IMAGE_TYPES) as [ImageType, ...ImageType[]]),
    size: z.number().int().min(1).max(MAX_IMAGE_BYTES, "Images can be up to 10 MB."),
  }),
  "The image you're about to upload.",
);
type CreateUploadRequest = z.infer<typeof CreateUploadRequest>;

export const UploadSchema = named(
  "Upload",
  z.object({
    key: z.string().describe("Send this as imageKey when submitting the joke."),
    url: z.string(),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()).describe("Send these headers with the upload, exactly."),
    expiresAt: z.iso.datetime(),
  }),
  "Where to PUT the file. The URL only accepts this exact type and size.",
);

@ApiTags("uploads")
@Controller({ version: "1" })
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post("me/uploads")
  @Roles("writer")
  @ApiBearerAuth()
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  @ApiOperation({ operationId: "createUpload", summary: "Get a signed URL to upload a joke image to" })
  @ApiZodBody(CreateUploadRequest)
  @ApiZodResponse(201, UploadSchema)
  @ApiZodResponse(422, ProblemSchema, "Unsupported type or too large")
  async create(@Auth() auth: AuthContext, @Body(zod(CreateUploadRequest)) body: CreateUploadRequest) {
    const key = `jokes/${auth.userId}/${randomUUID()}.${IMAGE_TYPES[body.contentType]}`;
    return { key, ...(await this.storage.presignPut(key, body.contentType, body.size)) };
  }

  /** Local storage only: the signed upload target. In production, uploads go to S3 instead. */
  @Put("uploads/local")
  @Public()
  @HttpCode(204)
  @ApiExcludeEndpoint()
  async receive(@Query() q: Record<string, string>, @Req() req: Request) {
    if (this.storage.driver !== "local") throw new AppError(404, "not_found", "Not found.");
    await this.storage.receiveLocal(
      q,
      { contentType: req.headers["content-type"], contentLength: req.headers["content-length"] },
      req,
    );
  }
}
