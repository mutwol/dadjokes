import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { Auth, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { ProblemSchema } from "../common/errors";
import { ApiZodResponse, zod } from "../common/zod";
import { IsoDate } from "../jokes/schemas";
import { DeliveriesService } from "./deliveries.service";
import { JokeSchema, StudioSummarySchema, TodaySchema } from "./schemas";

@ApiTags("today")
@ApiBearerAuth()
@Controller({ path: "me", version: "1" })
export class TodayController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get("today")
  @ApiOperation({ operationId: "getToday", summary: "Today's joke (sealed until opened), this week and the streak" })
  @ApiZodResponse(200, TodaySchema)
  today(@Auth() auth: AuthContext) {
    return this.deliveries.today(auth.userId);
  }

  @Post("deliveries/:date/open")
  @HttpCode(200)
  @ApiOperation({ operationId: "openDelivery", summary: "Open the joke delivered on one of my days. Safe to repeat." })
  @ApiParam({ name: "date", description: "My local date, YYYY-MM-DD" })
  @ApiZodResponse(200, JokeSchema)
  @ApiZodResponse(404, ProblemSchema, "No joke was delivered that day")
  @ApiZodResponse(410, ProblemSchema, "It expired before it was opened")
  open(@Auth() auth: AuthContext, @Param("date", zod(IsoDate)) date: string) {
    return this.deliveries.open(auth.userId, date);
  }

  @Get("studio")
  @Roles("writer")
  @ApiOperation({ operationId: "getStudioSummary", summary: "How my jokes are doing" })
  @ApiZodResponse(200, StudioSummarySchema)
  studio(@Auth() auth: AuthContext) {
    return this.deliveries.studioSummary(auth.userId);
  }
}

@ApiTags("jokes")
@ApiBearerAuth()
@Controller({ path: "jokes", version: "1" })
export class JokesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get(":id")
  @ApiOperation({ operationId: "getJoke", summary: "A joke I've opened, one of mine, or any joke for curators" })
  @ApiZodResponse(200, JokeSchema)
  @ApiZodResponse(404, ProblemSchema, "Not found, or not opened yet")
  get(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.deliveries.getJoke(auth.userId, id);
  }
}
