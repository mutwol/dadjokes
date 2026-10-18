import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import { Auth, Public, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { ApiZodBody, ApiZodQuery, ApiZodResponse, zod } from "../common/zod";
import { AdminService } from "./admin.service";
import {
  AdminEngagementSchema,
  AdminFinanceSchema,
  AdminOverviewSchema,
  AdminUserDetailSchema,
  AdminUserPageSchema,
  AdminUsersQuery,
  AuditPageSchema,
  AuditQuery,
  LandingSchema,
  RangeQuery,
  SetRolesRequest,
  SuspendRequest,
  TagListSchema,
} from "./schemas";

@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@Controller({ path: "admin", version: "1" })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  @ApiOperation({ operationId: "getAdminOverview", summary: "Today at a glance: people, opens, streaks, queue, moderation, money" })
  @ApiZodResponse(200, AdminOverviewSchema)
  overview() {
    return this.admin.overview();
  }

  @Get("finance")
  @ApiOperation({ operationId: "getAdminFinance", summary: "Tips, fees, payouts and balances for a period" })
  @ApiZodQuery(RangeQuery)
  @ApiZodResponse(200, AdminFinanceSchema)
  finance(@Query(zod(RangeQuery)) q: RangeQuery) {
    return this.admin.finance(q.days);
  }

  @Get("finance/ledger.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="daddy-jokes-ledger.csv"')
  @ApiProduces("text/csv")
  @ApiOperation({ operationId: "exportLedger", summary: "Every ledger entry in the period, as CSV" })
  @ApiZodQuery(RangeQuery)
  ledger(@Query(zod(RangeQuery)) q: RangeQuery) {
    return this.admin.ledgerCsv(q.days);
  }

  @Get("engagement")
  @ApiOperation({ operationId: "getAdminEngagement", summary: "Opens, streaks, top jokes and reactions for a period" })
  @ApiZodQuery(RangeQuery)
  @ApiZodResponse(200, AdminEngagementSchema)
  engagement(@Query(zod(RangeQuery)) q: RangeQuery) {
    return this.admin.engagement(q.days);
  }

  @Get("users")
  @ApiOperation({ operationId: "listAdminUsers", summary: "People, with search, filters and sorting (newest first by default)" })
  @ApiZodQuery(AdminUsersQuery)
  @ApiZodResponse(200, AdminUserPageSchema)
  users(@Query(zod(AdminUsersQuery)) q: AdminUsersQuery) {
    return this.admin.users(q);
  }

  @Get("users/:id")
  @ApiOperation({ operationId: "getAdminUser", summary: "One person: profile, stats, messages, runs and history" })
  @ApiZodResponse(200, AdminUserDetailSchema)
  user(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.admin.user(id);
  }

  @Put("users/:id/roles")
  @ApiOperation({ operationId: "setAdminUserRoles", summary: "Set someone's roles" })
  @ApiZodBody(SetRolesRequest)
  @ApiZodResponse(200, AdminUserDetailSchema)
  roles(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(SetRolesRequest)) body: SetRolesRequest) {
    return this.admin.setRoles(auth.userId, id, body.roles);
  }

  @Post("users/:id/suspend")
  @ApiOperation({ operationId: "suspendUser", summary: "Suspend an account and sign it out everywhere" })
  @ApiZodBody(SuspendRequest)
  @ApiZodResponse(200, AdminUserDetailSchema)
  suspend(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(SuspendRequest)) body: SuspendRequest) {
    return this.admin.setSuspended(auth.userId, id, body.reason);
  }

  @Post("users/:id/unsuspend")
  @ApiOperation({ operationId: "unsuspendUser", summary: "Lift a suspension" })
  @ApiZodResponse(200, AdminUserDetailSchema)
  unsuspend(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.admin.setSuspended(auth.userId, id, null);
  }

  @Put("users/:id/tags/:tag")
  @ApiOperation({ operationId: "tagUser", summary: "Add a tag to someone" })
  @ApiZodResponse(200, AdminUserDetailSchema)
  tag(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Param("tag") tag: string) {
    return this.admin.tag(auth.userId, id, tag, true);
  }

  @Delete("users/:id/tags/:tag")
  @ApiOperation({ operationId: "untagUser", summary: "Remove a tag from someone" })
  @ApiZodResponse(200, AdminUserDetailSchema)
  untag(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Param("tag") tag: string) {
    return this.admin.tag(auth.userId, id, tag, false);
  }

  @Get("tags")
  @ApiOperation({ operationId: "listTags", summary: "Tags in use, most common first" })
  @ApiZodResponse(200, TagListSchema)
  tags() {
    return this.admin.tags();
  }

  @Get("audit")
  @ApiOperation({ operationId: "listAudit", summary: "The audit log, newest first" })
  @ApiZodQuery(AuditQuery)
  @ApiZodResponse(200, AuditPageSchema)
  audit(@Query(zod(AuditQuery)) q: AuditQuery) {
    return this.admin.auditLog(q);
  }
}

/** Public data for the landing page. */
@ApiTags("public")
@Public()
@Controller({ path: "public", version: "1" })
export class PublicController {
  constructor(private readonly admin: AdminService) {}

  @Get("landing")
  @Header("Cache-Control", "public, max-age=300")
  @ApiOperation({ operationId: "getLanding", summary: "A favourite joke, headline numbers and popular writers for the landing page" })
  @ApiZodResponse(200, LandingSchema)
  landing() {
    return this.admin.landing();
  }
}
