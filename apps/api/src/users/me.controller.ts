import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { Auth, Public, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { ProblemSchema } from "../common/errors";
import { ApiZodBody, ApiZodResponse, zod } from "../common/zod";
import {
  CompleteOnboardingRequest,
  HandleAvailabilitySchema,
  MeSchema,
  PayoutMethodRequest,
  ReplaceRolesRequest,
  TopicListSchema,
  UpdateMeRequest,
  UpdatePreferencesRequest,
} from "./schemas";
import { UsersService } from "./users.service";

@ApiTags("me")
@ApiBearerAuth()
@Controller({ path: "me", version: "1" })
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ operationId: "getMe", summary: "The signed-in person" })
  @ApiZodResponse(200, MeSchema)
  @ApiZodResponse(401, ProblemSchema, "Not signed in")
  getMe(@Auth() auth: AuthContext) {
    return this.users.getMe(auth.userId);
  }

  @Patch()
  @ApiOperation({ operationId: "updateMe", summary: "Update name, handle, country, bio or time zone" })
  @ApiZodBody(UpdateMeRequest)
  @ApiZodResponse(200, MeSchema)
  @ApiZodResponse(409, ProblemSchema, "Handle taken (code: handle_taken)")
  async updateMe(@Auth() auth: AuthContext, @Body(zod(UpdateMeRequest)) body: z.infer<typeof UpdateMeRequest>) {
    await this.users.updateProfile(auth.userId, body);
    return this.users.getMe(auth.userId);
  }

  @Post("onboarding")
  @HttpCode(200)
  @ApiOperation({
    operationId: "completeOnboarding",
    summary: "Save everything from onboarding at once",
    description: "Profile, roles, preferences, subscriptions and an optional payout method, in one transaction.",
  })
  @ApiZodBody(CompleteOnboardingRequest)
  @ApiZodResponse(200, MeSchema)
  @ApiZodResponse(409, ProblemSchema, "Handle taken, or already onboarded")
  @ApiZodResponse(422, ProblemSchema, "Validation failed")
  completeOnboarding(
    @Auth() auth: AuthContext,
    @Body(zod(CompleteOnboardingRequest)) body: z.infer<typeof CompleteOnboardingRequest>,
  ) {
    return this.users.completeOnboarding(auth.userId, body);
  }

  @Put("roles")
  @ApiOperation({ operationId: "replaceMyRoles", summary: "Turn reading and writing on or off" })
  @ApiZodBody(ReplaceRolesRequest)
  @ApiZodResponse(200, MeSchema)
  @ApiZodResponse(422, ProblemSchema, "Empty list (keep at least one)")
  async replaceRoles(@Auth() auth: AuthContext, @Body(zod(ReplaceRolesRequest)) body: z.infer<typeof ReplaceRolesRequest>) {
    await this.users.replaceRoles(auth.userId, body.roles);
    return this.users.getMe(auth.userId);
  }

  @Patch("preferences")
  @ApiOperation({ operationId: "updateMyPreferences", summary: "Delivery hour, joke origin and topics" })
  @ApiZodBody(UpdatePreferencesRequest)
  @ApiZodResponse(200, MeSchema)
  async updatePreferences(
    @Auth() auth: AuthContext,
    @Body(zod(UpdatePreferencesRequest)) body: z.infer<typeof UpdatePreferencesRequest>,
  ) {
    await this.users.updatePreferences(auth.userId, body);
    return this.users.getMe(auth.userId);
  }

  @Put("payout-method")
  @Roles("writer")
  @ApiOperation({ operationId: "setMyPayoutMethod", summary: "Where tips are paid (writers only)" })
  @ApiZodBody(PayoutMethodRequest)
  @ApiZodResponse(200, MeSchema)
  @ApiZodResponse(403, ProblemSchema, "Writing is off (code: role_required)")
  async setPayout(@Auth() auth: AuthContext, @Body(zod(PayoutMethodRequest)) body: z.infer<typeof PayoutMethodRequest>) {
    await this.users.setPayout(auth.userId, body);
    return this.users.getMe(auth.userId);
  }

  @Delete("payout-method")
  @HttpCode(204)
  @ApiOperation({ operationId: "removeMyPayoutMethod", summary: "Remove the payout method" })
  @ApiNoContentResponse({ description: "Removed" })
  async removePayout(@Auth() auth: AuthContext) {
    await this.users.removePayout(auth.userId);
  }
}

@ApiTags("me")
@ApiBearerAuth()
@Controller({ path: "handles", version: "1" })
export class HandlesController {
  constructor(private readonly users: UsersService) {}

  @Get(":handle/availability")
  @ApiOperation({ operationId: "checkHandle", summary: "Whether a username is free, with a suggestion if not" })
  @ApiZodResponse(200, HandleAvailabilitySchema)
  check(@Auth() auth: AuthContext, @Param("handle") handle: string) {
    return this.users.handleAvailability(handle, auth.userId);
  }
}

@ApiTags("catalog")
@Public()
@Controller({ path: "topics", version: "1" })
export class TopicsController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ operationId: "listTopics", summary: "Joke topics people can pick" })
  @ApiZodResponse(200, TopicListSchema)
  async list() {
    return { data: await this.users.listTopics() };
  }
}
