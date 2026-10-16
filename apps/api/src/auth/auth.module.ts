import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { AppConfig } from "../config/config.module";
import { MailModule } from "../mail/mail.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { CodesService } from "./codes.service";
import { AuthGuard, RolesGuard } from "./guards";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";

@Module({
  imports: [
    UsersModule,
    MailModule,
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.get("JWT_SECRET"),
        signOptions: { algorithm: "HS256", issuer: "daddy-jokes" },
        verifyOptions: { algorithms: ["HS256"], issuer: "daddy-jokes" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    CodesService,
    SessionsService,
    TokensService,
    // Every route requires a signed-in caller unless marked @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
