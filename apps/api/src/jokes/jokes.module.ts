import { Module } from "@nestjs/common";
import { JokesService } from "./jokes.service";
import { MyJokesController } from "./my-jokes.controller";

@Module({
  controllers: [MyJokesController],
  providers: [JokesService],
  exports: [JokesService],
})
export class JokesModule {}
