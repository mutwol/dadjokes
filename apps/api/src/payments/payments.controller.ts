import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Auth, Public, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { AppError, ProblemSchema } from "../common/errors";
import { ApiZodBody, ApiZodResponse, zod } from "../common/zod";
import { MpesaClient } from "./mpesa.client";
import { PaymentsService } from "./payments.service";
import {
  BalanceSchema,
  CreatePayoutRequest,
  CreateTipRequest,
  PayoutListSchema,
  PayoutSchema,
  TipSchema,
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
    summary: "Tip the writer with M-Pesa. The phone gets a PIN prompt; poll the tip for the result.",
  })
  @ApiZodBody(CreateTipRequest)
  @ApiZodResponse(201, TipSchema)
  @ApiZodResponse(422, ProblemSchema, "Bad amount or number, or it's your own joke")
  @ApiZodResponse(502, ProblemSchema, "M-Pesa is unavailable")
  tip(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string, @Body(zod(CreateTipRequest)) body: CreateTipRequest) {
    return this.payments.createTip(auth.userId, id, body.amountKes, body.phone);
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
