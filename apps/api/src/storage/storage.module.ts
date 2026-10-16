import { Global, Module } from "@nestjs/common";
import { StorageService } from "./storage.service";
import { UploadsController } from "./uploads.controller";

@Global()
@Module({
  controllers: [UploadsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}

/** For the worker: storage without the HTTP endpoints. */
@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageCoreModule {}
