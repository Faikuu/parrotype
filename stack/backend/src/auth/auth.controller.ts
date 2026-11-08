import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, SESSION_COOKIE, sessionCookieOptions } from './auth.service';
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
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard, readSessionUser, type AuthUser } from './jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  @Throttle(AUTH_THROTTLE)
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.register(body);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    return { user };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(body);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    return { user };
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
}
