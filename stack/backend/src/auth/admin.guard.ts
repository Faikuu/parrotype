import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { readSessionUser } from './jwt-auth.guard';

/**
 * Admin routes. No session (or a banned account, which has none) is 401. A signed-in user whose
 * database role is not "admin" is 403. The role is read from the database on every request, never
 * from the token, so a revoked admin loses access immediately.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = await readSessionUser(req, this.jwt, this.prisma);
    if (!user) throw new UnauthorizedException();
    if (user.role !== 'admin') throw new ForbiddenException('Admins only');
    req.user = user;
    return true;
  }
}
