import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { TwoFactorService } from './two-factor.service';
import { jwtModuleOptions } from './jwt.options';
import { AUTH_CLOCK } from './tokens';

@Module({
  imports: [JwtModule.registerAsync({ useFactory: jwtModuleOptions }), MailModule, PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
    EmailVerificationService,
    TwoFactorService,
    { provide: AUTH_CLOCK, useValue: () => new Date() },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
