import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Auth, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { ProblemSchema } from "../common/errors";
import { ApiZodBody, ApiZodQuery, ApiZodResponse, zod } from "../common/zod";
import { AppealsService } from "./appeals.service";
import { AppealListSchema, AppealSchema, AppealsQuery, CreateAppealRequest, ResolveAppealRequest } from "./schemas";

@ApiTags("moderation")
@ApiBearerAuth()
@Controller({ version: "1" })
export class AppealsController {
  constructor(private readonly appeals: AppealsService) {}

  @Post("me/jokes/:id/appeal")
  @Roles("writer")
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @ApiOperation({ operationId: "appealJoke", summary: "Ask curators to look again at a joke of mine that was taken down" })
  @ApiZodBody(CreateAppealRequest)
  @ApiZodResponse(201, AppealSchema)
  @ApiZodResponse(409, ProblemSchema, "Already appealed")
  appeal(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(CreateAppealRequest)) body: CreateAppealRequest) {
    return this.appeals.create(auth.userId, id, body.message);
  }

  @Get("me/appeals")
  @Roles("writer")
  @ApiOperation({ operationId: "listMyAppeals", summary: "My appeals, newest first" })
  @ApiZodResponse(200, AppealListSchema)
  mine(@Auth() auth: AuthContext) {
    return this.appeals.mine(auth.userId);
  }

  @Get("curation/appeals")
  @Roles("curator", "admin")
  @ApiOperation({ operationId: "listAppeals", summary: "Appeals from writers" })
  @ApiZodQuery(AppealsQuery)
  @ApiZodResponse(200, AppealListSchema)
  list(@Query(zod(AppealsQuery)) q: AppealsQuery) {
    return this.appeals.forCurators(q.status);
  }

  @Post("curation/appeals/:id/resolve")
  @Roles("admin")
  @ApiOperation({ operationId: "resolveAppeal", summary: "Keep the joke down, or put it back up" })
  @ApiZodBody(ResolveAppealRequest)
  @ApiZodResponse(200, AppealSchema)
  resolve(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(ResolveAppealRequest)) body: ResolveAppealRequest) {
    return this.appeals.resolve(auth.userId, id, body);
  }
}
