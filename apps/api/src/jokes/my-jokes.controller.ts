import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Auth, Roles } from "../auth/decorators";
import type { AuthContext } from "../auth/decorators";
import { ProblemSchema } from "../common/errors";
import { ApiZodBody, ApiZodQuery, ApiZodResponse, zod } from "../common/zod";
import { JokesService } from "./jokes.service";
import { CreateJokeRequest, ListMyJokesQuery, SubmissionPageSchema, SubmissionSchema } from "./schemas";

/** A writer's own jokes: submit, list, withdraw. */
@ApiTags("my jokes")
@ApiBearerAuth()
@Roles("writer")
@Controller({ path: "me/jokes", version: "1" })
export class MyJokesController {
  constructor(private readonly jokes: JokesService) {}

  @Post()
  @ApiOperation({ operationId: "submitJoke", summary: "Send a joke to the curators" })
  @ApiZodBody(CreateJokeRequest)
  @ApiZodResponse(201, SubmissionSchema, "Submitted for review")
  @ApiZodResponse(409, ProblemSchema, "Already sent this joke")
  @ApiZodResponse(422, ProblemSchema, "Not valid, or too many jokes waiting for review")
  submit(@Auth() auth: AuthContext, @Body(zod(CreateJokeRequest)) body: CreateJokeRequest) {
    return this.jokes.submit(auth.userId, body);
  }

  @Get()
  @ApiOperation({ operationId: "listMyJokes", summary: "My jokes, newest first" })
  @ApiZodQuery(ListMyJokesQuery)
  @ApiZodResponse(200, SubmissionPageSchema)
  list(@Auth() auth: AuthContext, @Query(zod(ListMyJokesQuery)) query: ListMyJokesQuery) {
    return this.jokes.listMine(auth.userId, query);
  }

  @Get(":id")
  @ApiOperation({ operationId: "getMyJoke", summary: "One of my jokes" })
  @ApiZodResponse(200, SubmissionSchema)
  @ApiZodResponse(404, ProblemSchema, "Not one of my jokes")
  get(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.jokes.getMine(auth.userId, id);
  }

  @Post(":id/withdraw")
  @HttpCode(200)
  @ApiOperation({
    operationId: "withdrawMyJoke",
    summary: "Withdraw a joke from review, or from the schedule before its day starts. Safe to repeat.",
  })
  @ApiZodResponse(200, SubmissionSchema)
  @ApiZodResponse(409, ProblemSchema, "Already going out")
  withdraw(@Auth() auth: AuthContext, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.jokes.withdraw(auth.userId, id);
  }
}
