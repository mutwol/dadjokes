import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Auth } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { ProblemSchema } from "../common/errors";
import { ApiZodQuery, ApiZodResponse, zod } from "../common/zod";
import { CreatorsService } from "./creators.service";
import { CreatorListSchema, CreatorPageSchema, CreatorSchema, ListCreatorsQuery } from "./schemas";

@ApiTags("creators")
@ApiBearerAuth()
@Controller({ path: "creators", version: "1" })
export class CreatorsController {
  constructor(private readonly creators: CreatorsService) {}

  @Get()
  @ApiOperation({ operationId: "listCreators", summary: "List writers, most subscribed first by default" })
  @ApiZodQuery(ListCreatorsQuery)
  @ApiZodResponse(200, CreatorPageSchema)
  list(@Auth() auth: AuthContext, @Query(zod(ListCreatorsQuery)) query: ListCreatorsQuery) {
    return this.creators.list(auth.userId, query);
  }

  @Get(":handle")
  @ApiOperation({ operationId: "getCreator", summary: "A writer's public profile" })
  @ApiZodResponse(200, CreatorSchema)
  @ApiZodResponse(404, ProblemSchema, "No writer with that handle")
  get(@Auth() auth: AuthContext, @Param("handle") handle: string) {
    return this.creators.getByHandle(auth.userId, handle);
  }
}

@ApiTags("subscriptions")
@ApiBearerAuth()
@Controller({ path: "me/subscriptions", version: "1" })
export class SubscriptionsController {
  constructor(private readonly creators: CreatorsService) {}

  @Get()
  @ApiOperation({ operationId: "listMySubscriptions", summary: "Writers I subscribe to" })
  @ApiZodResponse(200, CreatorListSchema)
  list(@Auth() auth: AuthContext) {
    return this.creators.listSubscriptions(auth.userId);
  }

  @Put(":creatorId")
  @HttpCode(204)
  @ApiOperation({ operationId: "subscribe", summary: "Subscribe to a writer. Safe to repeat." })
  @ApiNoContentResponse({ description: "Subscribed" })
  @ApiZodResponse(404, ProblemSchema, "No writer with that id")
  @ApiZodResponse(422, ProblemSchema, "Tried to subscribe to yourself")
  async subscribe(@Auth() auth: AuthContext, @Param("creatorId", new ParseUUIDPipe()) creatorId: string) {
    await this.creators.subscribe(auth.userId, creatorId);
  }

  @Delete(":creatorId")
  @HttpCode(204)
  @ApiOperation({ operationId: "unsubscribe", summary: "Unsubscribe from a writer. Safe to repeat." })
  @ApiNoContentResponse({ description: "Unsubscribed" })
  async unsubscribe(@Auth() auth: AuthContext, @Param("creatorId", new ParseUUIDPipe()) creatorId: string) {
    await this.creators.unsubscribe(auth.userId, creatorId);
  }
}
