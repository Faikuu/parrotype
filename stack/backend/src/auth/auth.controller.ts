import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService, SESSION_COOKIE, sessionCookieOptions } from './auth.service';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from './auth.schemas';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard, type AuthUser } from './jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() current: AuthUser) {
    return { user: await this.auth.getPublicUser(current.id) };
  }
}
