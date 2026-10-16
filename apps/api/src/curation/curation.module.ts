import { Module } from "@nestjs/common";
import { JokesModule } from "../jokes/jokes.module";
import { CurationController } from "./curation.controller";
import { CurationService } from "./curation.service";

@Module({
  imports: [JokesModule],
  controllers: [CurationController],
  providers: [CurationService],
})
export class CurationModule {}
