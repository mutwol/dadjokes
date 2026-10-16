import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { z } from "zod";
import { Auth, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { ProblemSchema } from "../common/errors";
import { ApiZodBody, ApiZodQuery, ApiZodResponse, named, zod } from "../common/zod";
import { DeliveriesService } from "../deliveries/deliveries.service";
import { EngagementService } from "./engagement.service";
import { LiveService } from "./live.service";
import {
  CommentPageSchema,
  CommentSchema,
  CommentsQuery,
  CreateCommentRequest,
  CreateReportRequest,
  EventsRequest,
  JokeStatsSchema,
  ReactRequest,
  ReportedItemListSchema,
  ResolveReportsRequest,
} from "./schemas";

/** How often an idle live stream sends a keep-alive, so proxies don't close it. */
const HEARTBEAT_MS = 25_000;
/** Bursts of changes are folded into one update. */
const COALESCE_MS = 400;

@ApiTags("engagement")
@ApiBearerAuth()
@Controller({ path: "jokes", version: "1" })
export class JokeEngagementController {
  constructor(
    private readonly engagement: EngagementService,
    private readonly deliveries: DeliveriesService,
    private readonly live: LiveService,
  ) {}

  @Put(":id/reaction")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ operationId: "react", summary: "React to a joke. Reacting again replaces your reaction." })
  @ApiZodBody(ReactRequest)
  @ApiZodResponse(200, JokeStatsSchema)
  @ApiZodResponse(422, ProblemSchema, "It's your own joke")
  react(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(ReactRequest)) body: ReactRequest) {
    return this.engagement.react(auth.userId, id, body.kind);
  }

  @Delete(":id/reaction")
  @ApiOperation({ operationId: "unreact", summary: "Take back your reaction" })
  @ApiZodResponse(200, JokeStatsSchema)
  unreact(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.engagement.unreact(auth.userId, id);
  }

  @Get(":id/comments")
  @ApiOperation({ operationId: "listComments", summary: "Comments on a joke, newest first" })
  @ApiZodQuery(CommentsQuery)
  @ApiZodResponse(200, CommentPageSchema)
  comments(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Query(zod(CommentsQuery)) q: CommentsQuery) {
    return this.engagement.listComments(auth.userId, id, q);
  }

  @Post(":id/comments")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: "addComment", summary: "Comment on a joke" })
  @ApiZodBody(CreateCommentRequest)
  @ApiZodResponse(201, CommentSchema)
  addComment(
    @Auth() auth: AuthContext,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(zod(CreateCommentRequest)) body: CreateCommentRequest,
  ) {
    return this.engagement.addComment(auth.userId, id, body.body);
  }

  /**
   * Server-sent events with the joke's counts: one `stats` event straight
   * away, then another whenever something changes. Read it with fetch (it
   * needs the Authorization header, which EventSource can't send).
   */
  @Get(":id/live")
  @ApiOperation({ operationId: "liveStats", summary: "Live counts for a joke (text/event-stream)" })
  @ApiProduces("text/event-stream")
  @ApiZodResponse(200, JokeStatsSchema, "Each `stats` event's data")
  async liveStats(
    @Auth() auth: AuthContext,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.deliveries.access(auth.userId, id);
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    let closed = false;
    let pending: NodeJS.Timeout | undefined;
    const send = async () => {
      if (closed) return;
      try {
        const stats = await this.engagement.stats(auth.userId, id);
        if (!closed) res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
      } catch {
        // The joke went away (taken down): end the stream.
        cleanup();
        res.end();
      }
    };
    const stop = this.live.listen(id, () => {
      pending ??= setTimeout(() => {
        pending = undefined;
        void send();
      }, COALESCE_MS);
    });
    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    const cleanup = () => {
      closed = true;
      stop();
      clearInterval(heartbeat);
      clearTimeout(pending);
    };
    req.on("close", cleanup);
    await send();
  }
}

@ApiTags("engagement")
@ApiBearerAuth()
@Controller({ version: "1" })
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Delete("comments/:id")
  @HttpCode(204)
  @ApiOperation({ operationId: "deleteComment", summary: "Delete my comment (curators: any comment)" })
  @ApiNoContentResponse({ description: "Deleted" })
  async deleteComment(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.engagement.deleteComment(auth.userId, id);
  }

  @Post("reports")
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60 * 60_000 } })
  @ApiOperation({ operationId: "report", summary: "Flag a joke or comment for the curators. Safe to repeat." })
  @ApiZodBody(CreateReportRequest)
  @ApiNoContentResponse({ description: "Received" })
  async report(@Auth() auth: AuthContext, @Body(zod(CreateReportRequest)) body: CreateReportRequest) {
    await this.engagement.report(auth.userId, body);
  }

  @Post("events")
  @HttpCode(202)
  @ApiOperation({ operationId: "recordEvents", summary: "Record replays and shares, in batches" })
  @ApiZodBody(EventsRequest)
  @ApiZodResponse(202, named("EventsAccepted", z.object({ accepted: z.number().int() })))
  async events(@Auth() auth: AuthContext, @Body(zod(EventsRequest)) body: EventsRequest) {
    return { accepted: await this.engagement.recordEvents(auth.userId, body) };
  }

  @Get("me/studio/daily")
  @Roles("writer")
  @ApiOperation({ operationId: "getStudioDaily", summary: "Opens, reactions and comments on my jokes, last 14 days" })
  @ApiZodResponse(
    200,
    named(
      "StudioDaily",
      z.object({
        data: z.array(
          z.object({ date: z.iso.date(), opens: z.number().int(), reactions: z.number().int(), comments: z.number().int() }),
        ),
      }),
    ),
  )
  async daily(@Auth() auth: AuthContext) {
    return { data: await this.engagement.writerDaily(auth.userId) };
  }

  @Get("curation/reports")
  @Roles("curator", "admin")
  @ApiOperation({ operationId: "listReports", summary: "Open reports, grouped by what was reported" })
  @ApiZodResponse(200, ReportedItemListSchema)
  reports() {
    return this.engagement.openReports();
  }

  @Post("curation/reports/resolve")
  @HttpCode(204)
  @Roles("curator", "admin")
  @ApiOperation({ operationId: "resolveReports", summary: "Dismiss reports, or take the joke or comment down" })
  @ApiZodBody(ResolveReportsRequest)
  @ApiNoContentResponse({ description: "Resolved" })
  async resolve(@Auth() auth: AuthContext, @Body(zod(ResolveReportsRequest)) body: ResolveReportsRequest) {
    await this.engagement.resolve(auth.userId, body);
  }
}
