import { Module } from "@nestjs/common";
import { AdminController, PublicController } from "./admin.controller";
import { AdminService } from "./admin.service";

/** The admin console's read models and people management, plus the public landing data. */
@Module({
  controllers: [AdminController, PublicController],
  providers: [AdminService],
})
export class AdminModule {}
