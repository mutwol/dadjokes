import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Auth, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { ProblemSchema } from "../common/errors";
import { ApiZodBody, ApiZodResponse, zod } from "../common/zod";
import { RulesService } from "./rules.service";
import type { RuleDefinition } from "./model";

type RunTestsRequestBody = { definition?: RuleDefinition };
import {
  CreateRuleSetRequest,
  DecisionPointListSchema,
  EvaluateRequest,
  EvaluationSchema,
  PublishResultSchema,
  RuleSetDetailSchema,
  RuleSetListSchema,
  RuleVersionListSchema,
  RuleVersionSchema,
  RunTestsRequest,
  TestReportSchema,
  UpdateRuleDraftRequest,
} from "./schemas";

@ApiTags("admin: rules")
@ApiBearerAuth()
@Roles("admin")
@Controller({ path: "admin", version: "1" })
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get("decision-points")
  @ApiOperation({ operationId: "listDecisionPoints", summary: "Where the app asks rule sets for decisions, with their facts" })
  @ApiZodResponse(200, DecisionPointListSchema)
  decisionPoints() {
    return this.rules.decisionPoints();
  }

  @Get("rules")
  @ApiOperation({ operationId: "listRuleSets", summary: "Every rule set" })
  @ApiZodResponse(200, RuleSetListSchema)
  list() {
    return this.rules.list();
  }

  @Post("rules")
  @ApiOperation({ operationId: "createRuleSet", summary: "Start a new rule set (an empty draft)" })
  @ApiZodBody(CreateRuleSetRequest)
  @ApiZodResponse(201, RuleSetDetailSchema)
  @ApiZodResponse(409, ProblemSchema, "Key taken")
  create(@Auth() auth: AuthContext, @Body(zod(CreateRuleSetRequest)) body: CreateRuleSetRequest) {
    return this.rules.create(auth.userId, body);
  }

  @Get("rules/:id")
  @ApiOperation({ operationId: "getRuleSet", summary: "A rule set with its draft" })
  @ApiZodResponse(200, RuleSetDetailSchema)
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.rules.get(id);
  }

  @Put("rules/:id/draft")
  @ApiOperation({ operationId: "saveRuleDraft", summary: "Save the draft. Send the revision you loaded." })
  @ApiZodBody(UpdateRuleDraftRequest)
  @ApiZodResponse(200, RuleSetDetailSchema)
  @ApiZodResponse(409, ProblemSchema, "Someone else saved in between")
  save(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(UpdateRuleDraftRequest)) body: UpdateRuleDraftRequest) {
    return this.rules.saveDraft(auth.userId, id, body);
  }

  @Post("rules/:id/evaluate")
  @ApiOperation({ operationId: "evaluateRuleSet", summary: "Try the draft (or live version) on some facts, with a trace" })
  @ApiZodBody(EvaluateRequest)
  @ApiZodResponse(200, EvaluationSchema)
  evaluate(@Param("id", new ParseUUIDPipe()) id: string, @Body(zod(EvaluateRequest)) body: EvaluateRequest) {
    return this.rules.evaluateDraft(id, body.facts, body.source, body.definition);
  }

  @Post("rules/:id/test")
  @ApiOperation({ operationId: "testRuleSet", summary: "Run the test cases against the draft (or unsaved edits)" })
  @ApiZodBody(RunTestsRequest)
  @ApiZodResponse(200, TestReportSchema)
  test(@Param("id", new ParseUUIDPipe()) id: string, @Body(zod(RunTestsRequest)) body: RunTestsRequestBody) {
    return this.rules.test(id, body.definition);
  }

  @Post("rules/:id/publish")
  @ApiOperation({ operationId: "publishRuleSet", summary: "Publish the saved draft if every test passes" })
  @ApiZodResponse(200, PublishResultSchema)
  publish(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.rules.publish(auth.userId, id);
  }

  @Post("rules/:id/archive")
  @ApiOperation({ operationId: "archiveRuleSet", summary: "Stop using a rule set (system ones can't be archived)" })
  @ApiZodResponse(200, RuleSetDetailSchema)
  archive(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.rules.setArchived(auth.userId, id, true);
  }

  @Post("rules/:id/unarchive")
  @ApiOperation({ operationId: "unarchiveRuleSet", summary: "Bring an archived rule set back" })
  @ApiZodResponse(200, RuleSetDetailSchema)
  unarchive(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.rules.setArchived(auth.userId, id, false);
  }

  @Get("rules/:id/versions")
  @ApiOperation({ operationId: "listRuleVersions", summary: "Published versions, newest first" })
  @ApiZodResponse(200, RuleVersionListSchema)
  versions(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.rules.versions(id);
  }

  @Get("rules/:id/versions/:version")
  @ApiOperation({ operationId: "getRuleVersion", summary: "One published version" })
  @ApiZodResponse(200, RuleVersionSchema)
  version(@Param("id", new ParseUUIDPipe()) id: string, @Param("version", ParseIntPipe) version: number) {
    return this.rules.version(id, version);
  }

  @Post("rules/:id/versions/:version/restore")
  @ApiOperation({ operationId: "restoreRuleVersion", summary: "Copy an old version into the draft" })
  @ApiZodResponse(200, RuleSetDetailSchema)
  restore(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Param("version", ParseIntPipe) version: number) {
    return this.rules.restoreVersion(auth.userId, id, version);
  }
}
