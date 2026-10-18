import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Auth, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { ProblemSchema } from "../common/errors";
import { ApiZodBody, ApiZodQuery, ApiZodResponse, named, zod } from "../common/zod";
import { AutomationService } from "./automation.service";
import {
  AutomationCatalogSchema,
  AutomationStatsSchema,
  CreateWorkflowRequest,
  RunsQuery,
  StartRunRequest,
  UpdateWorkflowDraftRequest,
  WorkflowDetailSchema,
  WorkflowListSchema,
  WorkflowPublishResultSchema,
  WorkflowRunDetailSchema,
  WorkflowRunListSchema,
  WorkflowVersionListSchema,
} from "./schemas";

const QueuedSchema = named("Queued", z.object({ queued: z.boolean() }));

@ApiTags("admin: automations")
@ApiBearerAuth()
@Roles("admin")
@Controller({ path: "admin", version: "1" })
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Get("automation/catalog")
  @ApiOperation({ operationId: "getAutomationCatalog", summary: "Triggers, step types, templates and person facts for the editor" })
  @ApiZodResponse(200, AutomationCatalogSchema)
  catalog() {
    return this.automation.catalog();
  }

  @Get("automation/stats")
  @ApiOperation({ operationId: "getAutomationStats", summary: "Queue health and activity in the last day" })
  @ApiZodResponse(200, AutomationStatsSchema)
  stats() {
    return this.automation.stats();
  }

  @Get("workflows")
  @ApiOperation({ operationId: "listWorkflows", summary: "Every workflow, last edited first" })
  @ApiZodResponse(200, WorkflowListSchema)
  list() {
    return this.automation.list();
  }

  @Post("workflows")
  @ApiOperation({ operationId: "createWorkflow", summary: "A new workflow, empty or from a template" })
  @ApiZodBody(CreateWorkflowRequest)
  @ApiZodResponse(201, WorkflowDetailSchema)
  create(@Auth() auth: AuthContext, @Body(zod(CreateWorkflowRequest)) body: CreateWorkflowRequest) {
    return this.automation.create(auth.userId, body);
  }

  @Get("workflows/:id")
  @ApiOperation({ operationId: "getWorkflow", summary: "A workflow with its draft" })
  @ApiZodResponse(200, WorkflowDetailSchema)
  get(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.automation.get(id);
  }

  @Put("workflows/:id/draft")
  @ApiOperation({ operationId: "saveWorkflowDraft", summary: "Save the draft. Send the revision you loaded." })
  @ApiZodBody(UpdateWorkflowDraftRequest)
  @ApiZodResponse(200, WorkflowDetailSchema)
  @ApiZodResponse(409, ProblemSchema, "Someone else saved in between")
  save(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(UpdateWorkflowDraftRequest)) body: UpdateWorkflowDraftRequest) {
    return this.automation.saveDraft(auth.userId, id, body);
  }

  @Post("workflows/:id/publish")
  @ApiOperation({ operationId: "publishWorkflow", summary: "Check the saved draft, publish it and turn the workflow on" })
  @ApiZodResponse(200, WorkflowPublishResultSchema)
  publish(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.automation.publish(auth.userId, id);
  }

  @Post("workflows/:id/pause")
  @ApiOperation({ operationId: "pauseWorkflow", summary: "Stop starting new runs (waiting runs still finish)" })
  @ApiZodResponse(200, WorkflowDetailSchema)
  pause(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.automation.setStatus(auth.userId, id, "paused");
  }

  @Post("workflows/:id/activate")
  @ApiOperation({ operationId: "activateWorkflow", summary: "Start running the published version again" })
  @ApiZodResponse(200, WorkflowDetailSchema)
  activate(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.automation.setStatus(auth.userId, id, "active");
  }

  @Post("workflows/:id/discard-draft")
  @ApiOperation({ operationId: "discardWorkflowDraft", summary: "Throw away unpublished edits" })
  @ApiZodResponse(200, WorkflowDetailSchema)
  discard(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.automation.discardDraft(auth.userId, id);
  }

  @Delete("workflows/:id")
  @HttpCode(204)
  @ApiOperation({ operationId: "deleteWorkflow", summary: "Delete a paused or unpublished workflow and its runs" })
  @ApiNoContentResponse({ description: "Deleted" })
  async remove(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.automation.remove(auth.userId, id);
  }

  @Get("workflows/:id/versions")
  @ApiOperation({ operationId: "listWorkflowVersions", summary: "Published versions, newest first" })
  @ApiZodResponse(200, WorkflowVersionListSchema)
  versions(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.automation.versions(id);
  }

  @Post("workflows/:id/versions/:version/restore")
  @ApiOperation({ operationId: "restoreWorkflowVersion", summary: "Copy an old version into the draft" })
  @ApiZodResponse(200, WorkflowDetailSchema)
  restore(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Param("version", ParseIntPipe) version: number) {
    return this.automation.restoreVersion(auth.userId, id, version);
  }

  @Get("workflows/:id/runs")
  @ApiOperation({ operationId: "listWorkflowRuns", summary: "Recent runs of one workflow" })
  @ApiZodQuery(RunsQuery)
  @ApiZodResponse(200, WorkflowRunListSchema)
  workflowRuns(@Param("id", new ParseUUIDPipe()) id: string, @Query(zod(RunsQuery)) q: RunsQuery) {
    return this.automation.runs(q, id);
  }

  @Post("workflows/:id/runs")
  @ApiOperation({ operationId: "startWorkflowRun", summary: "Run it now for one person: a test of the draft, or the live version" })
  @ApiZodBody(StartRunRequest)
  @ApiZodResponse(201, QueuedSchema)
  start(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(StartRunRequest)) body: StartRunRequest) {
    return this.automation.start(auth.userId, id, body.userId ?? auth.userId, body.mode);
  }

  @Get("runs")
  @ApiOperation({ operationId: "listRuns", summary: "Recent runs of every workflow" })
  @ApiZodQuery(RunsQuery)
  @ApiZodResponse(200, WorkflowRunListSchema)
  allRuns(@Query(zod(RunsQuery)) q: RunsQuery) {
    return this.automation.runs(q);
  }

  @Get("runs/:runId")
  @ApiOperation({ operationId: "getRun", summary: "One run with every step it took" })
  @ApiZodResponse(200, WorkflowRunDetailSchema)
  run(@Param("runId", new ParseUUIDPipe()) runId: string) {
    return this.automation.run(runId);
  }
}
