import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, SESSION_COOKIE, sessionCookieOptions } from './auth.service';
import { padResponse } from './response-timing';
import {
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  registerSchema,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type LoginInput,
  type RegisterInput,
} from './auth.schemas';
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  tokenSchema,
  twoFactorEnableSchema,
  twoFactorPasswordCodeSchema,
  twoFactorVerifySchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type TokenInput,
  type TwoFactorEnableInput,
  type TwoFactorPasswordCodeInput,
  type TwoFactorVerifyInput,
} from './security.schemas';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard, readSessionUser, type AuthUser } from './jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';
import { EmailVerificationService } from './email-verification.service';
import { TwoFactorService } from './two-factor.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { pickMailLanguage } from '../mail/locale';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
/** Reset requests per client address: 5 in 15 minutes. The per-email limit is in the service. */
const FORGOT_THROTTLE = { default: { limit: 5, ttl: 15 * 60_000 } };
/** Reset attempts per client address: 10 in 15 minutes. A reset costs a bcrypt hash only for a valid link. */
const RESET_THROTTLE = { default: { limit: 10, ttl: 15 * 60_000 } };
/** Verification attempts per client address: 20 in 15 minutes. */
const VERIFY_THROTTLE = { default: { limit: 20, ttl: 15 * 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly passwordReset: PasswordResetService,
    private readonly verification: EmailVerificationService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Post('register')
  @Throttle(AUTH_THROTTLE)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.register(body);
    // The verification email never fails the registration; the service logs a failed send.
    await this.verification.sendOnRegister(user.id, user.email, pickMailLanguage(req.headers['accept-language']));
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    return { user };
  }

  /**
   * Without two-factor sign-in: a session cookie and { user }. With it: no cookie, and
   * { twoFactorRequired: true, ticket } to exchange at POST /auth/2fa/verify.
   */
  @Post('login')
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body);
    if (result.kind === 'twoFactor') return { twoFactorRequired: true as const, ticket: result.ticket };
    res.cookie(SESSION_COOKIE, result.token, sessionCookieOptions());
    return { user: result.user };
  }

  /**
   * Public, so a stale or missing cookie still gets 200. A valid session bumps the user's
   * tokenVersion, which revokes the token that was just used (and any other copy of it).
   */
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const current = await readSessionUser(req, this.jwt, this.prisma);
    if (current) await this.auth.revokeSessions(current.id);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() current: AuthUser) {
    return { user: await this.auth.getPublicUser(current.id) };
  }

  /** Bumps tokenVersion (every other session ends) and sets a fresh cookie for this one. */
  @Patch('password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  async changePassword(
    @CurrentUser() current: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.auth.changePassword(current.id, body);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    return { ok: true };
  }

  @Delete('account')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  async deleteAccount(
    @CurrentUser() current: AuthUser,
    @Body(new ZodValidationPipe(deleteAccountSchema)) body: DeleteAccountInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.deleteAccount(current.id, body.password);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return { ok: true };
  }

  /** Always { ok: true }, whether or not the email has an account. */
  /** Always { ok: true }. Takes at least 400 ms plus up to 100 ms of jitter, so the timing does not reveal the account. */
  @Post('password/forgot')
  @HttpCode(200)
  @Throttle(FORGOT_THROTTLE)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: Request,
  ) {
    const started = Date.now();
    try {
      await this.passwordReset.forgot(body.email, pickMailLanguage(req.headers['accept-language']));
    } finally {
      await padResponse(started);
    }
    return { ok: true };
  }

  @Post('password/reset')
  @HttpCode(200)
  @Throttle(RESET_THROTTLE)
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    await this.passwordReset.reset(body.token, body.newPassword);
    return { ok: true };
  }

  @Post('email/verify')
  @HttpCode(200)
  @Throttle(VERIFY_THROTTLE)
  async verifyEmail(@Body(new ZodValidationPipe(tokenSchema)) body: TokenInput) {
    await this.verification.verify(body.token);
    return { ok: true };
  }

  @Post('email/resend')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async resendVerification(@CurrentUser() current: AuthUser, @Req() req: Request) {
    await this.verification.resend(current.id, pickMailLanguage(req.headers['accept-language']));
    return { ok: true };
  }

  @Post('2fa/setup')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  setupTwoFactor(@CurrentUser() current: AuthUser) {
    return this.twoFactor.setup(current.id);
  }

  @Post('2fa/enable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  enableTwoFactor(
    @CurrentUser() current: AuthUser,
    @Body(new ZodValidationPipe(twoFactorEnableSchema)) body: TwoFactorEnableInput,
  ) {
    return this.twoFactor.enable(current.id, body.code);
  }

  /** Turns two-factor sign-in off. Every session ends, so this sets a fresh cookie for the current one. */
  @Post('2fa/disable')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  async disableTwoFactor(
    @CurrentUser() current: AuthUser,
    @Body(new ZodValidationPipe(twoFactorPasswordCodeSchema)) body: TwoFactorPasswordCodeInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const lang = pickMailLanguage(req.headers['accept-language']);
    const { token } = await this.twoFactor.disable(current.id, body.password, body.code, lang);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    return { ok: true };
  }

  @Post('2fa/recovery-codes')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle(AUTH_THROTTLE)
  regenerateRecoveryCodes(
    @CurrentUser() current: AuthUser,
    @Body(new ZodValidationPipe(twoFactorPasswordCodeSchema)) body: TwoFactorPasswordCodeInput,
    @Req() req: Request,
  ) {
    return this.twoFactor.regenerateRecoveryCodes(
      current.id,
      body.password,
      body.code,
      pickMailLanguage(req.headers['accept-language']),
    );
  }

  /** Second login step: the ticket and a code. Sets the session cookie and returns { user }. */
  @Post('2fa/verify')
  @HttpCode(200)
  async verifyTwoFactor(
    @Body(new ZodValidationPipe(twoFactorVerifySchema)) body: TwoFactorVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const lang = pickMailLanguage(req.headers['accept-language']);
    const { user, token } = await this.twoFactor.verifyLogin(body.ticket, body.code, req.ip ?? 'unknown', lang);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    return { user };
  }
}
