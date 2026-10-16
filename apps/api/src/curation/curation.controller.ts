import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Auth, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { ProblemSchema } from "../common/errors";
import { ApiZodBody, ApiZodQuery, ApiZodResponse, zod } from "../common/zod";
import { CurationService } from "./curation.service";
import {
  CalendarQuery,
  CalendarSchema,
  CuratedJokeSchema,
  DeclineRequest,
  QueuePageSchema,
  QueueQuery,
  ScheduleRequest,
} from "./schemas";

/** Curators pick the daily joke: review the queue, schedule a day, or decline. */
@ApiTags("curation")
@ApiBearerAuth()
@Roles("curator", "admin")
@Controller({ path: "curation", version: "1" })
export class CurationController {
  constructor(private readonly curation: CurationService) {}

  @Get("queue")
  @ApiOperation({ operationId: "getReviewQueue", summary: "Jokes waiting for review, oldest first" })
  @ApiZodQuery(QueueQuery)
  @ApiZodResponse(200, QueuePageSchema)
  queue(@Query(zod(QueueQuery)) query: QueueQuery) {
    return this.curation.queue(query);
  }

  @Get("calendar")
  @ApiOperation({ operationId: "getCurationCalendar", summary: "Which days already have a joke" })
  @ApiZodQuery(CalendarQuery)
  @ApiZodResponse(200, CalendarSchema)
  calendar(@Query(zod(CalendarQuery)) query: CalendarQuery) {
    return this.curation.calendar(query);
  }

  @Get("jokes/:id")
  @ApiOperation({ operationId: "getCuratedJoke", summary: "Any joke, as curators see it" })
  @ApiZodResponse(200, CuratedJokeSchema)
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.curation.get(id);
  }

  @Post("jokes/:id/schedule")
  @HttpCode(200)
  @ApiOperation({ operationId: "scheduleJoke", summary: "Pick a joke for a day, or move it to another day" })
  @ApiZodBody(ScheduleRequest)
  @ApiZodResponse(200, CuratedJokeSchema)
  @ApiZodResponse(409, ProblemSchema, "The day is taken, or the joke can't be scheduled")
  @ApiZodResponse(422, ProblemSchema, "The day has already started somewhere")
  schedule(
    @Auth() auth: AuthContext,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(zod(ScheduleRequest)) body: ScheduleRequest,
  ) {
    return this.curation.schedule(auth.userId, id, body);
  }

  @Post("jokes/:id/decline")
  @HttpCode(200)
  @ApiOperation({ operationId: "declineJoke", summary: "Don't pick a joke, with a reason for the writer" })
  @ApiZodBody(DeclineRequest)
  @ApiZodResponse(200, CuratedJokeSchema)
  @ApiZodResponse(409, ProblemSchema, "Already going out")
  decline(
    @Auth() auth: AuthContext,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(zod(DeclineRequest)) body: DeclineRequest,
  ) {
    return this.curation.decline(auth.userId, id, body);
  }
}
