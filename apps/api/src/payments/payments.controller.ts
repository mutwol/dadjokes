import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Auth, Public, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { AppError, ProblemSchema } from "../common/errors";
import { ApiZodBody, ApiZodResponse, zod } from "../common/zod";
import { MoneyAdminService } from "./money-admin.service";
import { MpesaClient } from "./mpesa.client";
import { PaymentsService } from "./payments.service";
import {
  BalanceSchema,
  CreateFeePolicyRequest,
  CreatePayoutRequest,
  CreateTipRequest,
  CreatorFundPreviewSchema,
  CreatorFundRequest,
  CreatorFundRunListSchema,
  CreatorFundRunSchema,
  FeePolicyListSchema,
  FeePolicySchema,
  HideTipNoteRequest,
  PayoutListSchema,
  PayoutSchema,
  ReconciliationRunListSchema,
  ReconciliationRunSchema,
  SimulateTipPromptRequest,
  TipSchema,
  TipWallSchema,
} from "./schemas";

@ApiTags("tips")
@ApiBearerAuth()
@Controller({ version: "1" })
export class TipsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post("jokes/:id/tips")
  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  @ApiOperation({
    operationId: "tipJoke",
    summary:
      "Tip the writer with M-Pesa, optionally with a short public message. The phone gets a PIN prompt; poll the tip for the result.",
  })
  @ApiZodBody(CreateTipRequest)
  @ApiZodResponse(201, TipSchema)
  @ApiZodResponse(422, ProblemSchema, "Bad amount or number, or it's your own joke")
  @ApiZodResponse(502, ProblemSchema, "M-Pesa is unavailable")
  tip(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(CreateTipRequest)) body: CreateTipRequest) {
    return this.payments.createTip(auth.userId, id, body);
  }

  @Get("jokes/:id/tips")
  @ApiOperation({ operationId: "listJokeTips", summary: "Paid tips on a joke with their messages, newest first" })
  @ApiZodResponse(200, TipWallSchema)
  wall(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.payments.jokeTips(auth.userId, id);
  }

  @Put("tips/:id/note-hidden")
  @HttpCode(204)
  @ApiOperation({ operationId: "setTipNoteHidden", summary: "Hide or show a tip's message (the joke's writer, or a curator)" })
  @ApiZodBody(HideTipNoteRequest)
  @ApiNoContentResponse({ description: "Done" })
  async hideNote(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(HideTipNoteRequest)) body: HideTipNoteRequest) {
    await this.payments.setTipNoteHidden(auth.userId, id, body.hidden);
  }

  @Post("tips/:id/simulate")
  @HttpCode(200)
  @ApiOperation({
    operationId: "simulateTipPrompt",
    summary: "Test mode only: answer the simulated M-Pesa prompt for my pending tip (404 when real M-Pesa is on)",
  })
  @ApiZodBody(SimulateTipPromptRequest)
  @ApiZodResponse(200, TipSchema)
  simulate(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(SimulateTipPromptRequest)) body: SimulateTipPromptRequest) {
    return this.payments.simulateTipAnswer(auth.userId, id, body.answer);
  }

  @Get("tips/:id")
  @ApiOperation({ operationId: "getTip", summary: "How my tip is going" })
  @ApiZodResponse(200, TipSchema)
  get(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.payments.getTip(auth.userId, id);
  }

  @Get("me/balance")
  @Roles("writer")
  @ApiOperation({ operationId: "getBalance", summary: "My tips balance" })
  @ApiZodResponse(200, BalanceSchema)
  balance(@Auth() auth: AuthContext) {
    return this.payments.balance(auth.userId);
  }

  @Get("me/payouts")
  @Roles("writer")
  @ApiOperation({ operationId: "listPayouts", summary: "My withdrawals, newest first" })
  @ApiZodResponse(200, PayoutListSchema)
  payouts(@Auth() auth: AuthContext) {
    return this.payments.listPayouts(auth.userId);
  }

  @Post("me/payouts")
  @Roles("writer")
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @ApiOperation({ operationId: "requestPayout", summary: "Withdraw tips to my M-Pesa" })
  @ApiZodBody(CreatePayoutRequest)
  @ApiZodResponse(201, PayoutSchema)
  @ApiZodResponse(422, ProblemSchema, "Too little, more than the balance, or no M-Pesa number")
  requestPayout(@Auth() auth: AuthContext, @Body(zod(CreatePayoutRequest)) body: CreatePayoutRequest) {
    return this.payments.requestPayout(auth.userId, body.amountKes);
  }
}

/**
 * Safaricom calls these. The secret path token stops casual forgery, and a
 * callback never settles anything by itself: tips are confirmed with a status query.
 */
@Public()
@Controller({ path: "payments/mpesa", version: "1" })
export class MpesaCallbackController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly mpesa: MpesaClient,
  ) {}

  @Post("stk/:token")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async stk(@Param("token") token: string, @Body() body: unknown) {
    this.check(token);
    await this.payments.onStkCallback(body);
    return { ResultCode: 0, ResultDesc: "Accepted" };
  }

  @Post("b2c/result/:token")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async b2cResult(@Param("token") token: string, @Body() body: unknown) {
    this.check(token);
    await this.payments.onB2cResult(body);
    return { ResultCode: 0, ResultDesc: "Accepted" };
  }

  /** A queue timeout means M-Pesa didn't process it in time; the result may still come. */
  @Post("b2c/timeout/:token")
  @HttpCode(200)
  @ApiExcludeEndpoint()
  b2cTimeout(@Param("token") token: string) {
    this.check(token);
    return { ResultCode: 0, ResultDesc: "Accepted" };
  }

  private check(token: string) {
    if (token !== this.mpesa.callbackToken()) throw new AppError(404, "not_found", "Not found.");
  }
}

@ApiTags("admin")
@ApiBearerAuth()
@Roles("admin")
@Controller({ path: "admin/finance", version: "1" })
export class MoneyAdminController {
  constructor(private readonly money: MoneyAdminService) {}

  @Get("fee-policies")
  @ApiOperation({ operationId: "listFeePolicies", summary: "The platform's cut: the default rate and any per-writer rates, with history" })
  @ApiZodResponse(200, FeePolicyListSchema)
  feePolicies() {
    return this.money.feePolicies();
  }

  @Post("fee-policies")
  @ApiOperation({ operationId: "createFeePolicy", summary: "Add a rate. It applies to tips paid from its start; earlier tips keep their rate." })
  @ApiZodBody(CreateFeePolicyRequest)
  @ApiZodResponse(201, FeePolicySchema)
  @ApiZodResponse(404, ProblemSchema, "No writer with that handle")
  @ApiZodResponse(422, ProblemSchema, "Out of range or backdated")
  createFeePolicy(@Auth() auth: AuthContext, @Body(zod(CreateFeePolicyRequest)) body: CreateFeePolicyRequest) {
    return this.money.createFeePolicy(auth.userId, body);
  }

  @Get("reconciliations")
  @ApiOperation({ operationId: "listReconciliations", summary: "Recent books checks, newest first" })
  @ApiZodResponse(200, ReconciliationRunListSchema)
  reconciliations() {
    return this.money.reconciliations();
  }

  @Post("reconciliations")
  @ApiOperation({ operationId: "runReconciliation", summary: "Check the books now" })
  @ApiZodResponse(201, ReconciliationRunSchema)
  reconcile(@Auth() auth: AuthContext) {
    return this.money.reconcile(auth.userId);
  }

  @Get("creator-fund")
  @ApiOperation({ operationId: "listCreatorFundRuns", summary: "Creator fund payouts, newest period first" })
  @ApiZodResponse(200, CreatorFundRunListSchema)
  fundRuns() {
    return this.money.creatorFundRuns();
  }

  @Post("creator-fund/preview")
  @HttpCode(200)
  @ApiOperation({ operationId: "previewCreatorFund", summary: "How a pool would be split by qualified views. Changes nothing." })
  @ApiZodBody(CreatorFundRequest)
  @ApiZodResponse(200, CreatorFundPreviewSchema)
  previewFund(@Body(zod(CreatorFundRequest)) body: CreatorFundRequest) {
    return this.money.previewCreatorFund(body);
  }

  @Post("creator-fund")
  @ApiOperation({ operationId: "postCreatorFund", summary: "Pay the creator fund for a period into writers' pending balances" })
  @ApiZodBody(CreatorFundRequest)
  @ApiZodResponse(201, CreatorFundRunSchema)
  @ApiZodResponse(409, ProblemSchema, "That period (or part of it) was already paid")
  @ApiZodResponse(422, ProblemSchema, "No qualified views in the period")
  postFund(@Auth() auth: AuthContext, @Body(zod(CreatorFundRequest)) body: CreatorFundRequest) {
    return this.money.postCreatorFund(auth.userId, body);
  }
}
