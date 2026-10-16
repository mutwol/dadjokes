import { Body, Controller, Delete, Get, HttpCode, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Auth, Public } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { AppConfig } from "../config/config.module";
import { ApiZodBody, ApiZodQuery, ApiZodResponse, zod } from "../common/zod";
import { NotificationsService } from "./notifications.service";
import {
  ActivityPageSchema,
  ActivityQuery,
  PushConfigSchema,
  PushSubscriptionRequest,
  RemovePushSubscriptionRequest,
} from "./schemas";
import type { z } from "zod";

@ApiTags("activity")
@ApiBearerAuth()
@Controller({ version: "1" })
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: AppConfig,
  ) {}

  @Get("me/activity")
  @ApiOperation({ operationId: "listActivity", summary: "My Activity feed, newest first, with the unread count" })
  @ApiZodQuery(ActivityQuery)
  @ApiZodResponse(200, ActivityPageSchema)
  list(@Auth() auth: AuthContext, @Query(zod(ActivityQuery)) q: ActivityQuery) {
    return this.notifications.list(auth.userId, q);
  }

  @Post("me/activity/read")
  @HttpCode(204)
  @ApiOperation({ operationId: "markActivityRead", summary: "Mark everything in my feed as read" })
  @ApiNoContentResponse({ description: "Done" })
  async read(@Auth() auth: AuthContext) {
    await this.notifications.markAllRead(auth.userId);
  }

  @Get("push/config")
  @Public()
  @ApiOperation({ operationId: "getPushConfig", summary: "Whether push notifications are available, and the VAPID key" })
  @ApiZodResponse(200, PushConfigSchema)
  pushConfig() {
    const publicKey = this.config.get("VAPID_PUBLIC_KEY") ?? null;
    return { enabled: Boolean(publicKey), publicKey };
  }

  @Put("me/push-subscriptions")
  @HttpCode(204)
  @ApiOperation({ operationId: "addPushSubscription", summary: "Send push notifications to this browser" })
  @ApiZodBody(PushSubscriptionRequest)
  @ApiNoContentResponse({ description: "Saved" })
  async subscribe(
    @Auth() auth: AuthContext,
    @Body(zod(PushSubscriptionRequest)) body: PushSubscriptionRequest,
    @Req() req: Request,
  ) {
    await this.notifications.subscribe(auth.userId, body, req.headers["user-agent"]);
  }

  @Delete("me/push-subscriptions")
  @HttpCode(204)
  @ApiOperation({ operationId: "removePushSubscription", summary: "Stop push notifications to this browser" })
  @ApiZodBody(RemovePushSubscriptionRequest)
  @ApiNoContentResponse({ description: "Removed" })
  async unsubscribe(
    @Auth() auth: AuthContext,
    @Body(zod(RemovePushSubscriptionRequest)) body: z.infer<typeof RemovePushSubscriptionRequest>,
  ) {
    await this.notifications.unsubscribe(auth.userId, body.endpoint);
  }
}
