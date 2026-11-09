import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { readSessionUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ADMIN_ACCESS, type Permission } from './catalog';
import { REQUIRED_PERMISSIONS } from './permissions.decorator';
import { PermissionsService } from './permissions.service';
import { missingPermissions } from './rules';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The caller's effective permissions, loaded once per request by PermissionsGuard. */
      permissions?: ReadonlySet<Permission>;
    }
  }
}

/**
 * Checks the verified session, then the route's @RequirePermissions keys. No session (or a suspended
 * account) is 401. A missing permission is 403. The permissions are read from the database on every request,
 * so a revoked permission takes effect at once. The result is cached on req.permissions for the rest of
 * the request.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<Permission[] | undefined>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [ADMIN_ACCESS];

    const req = context.switchToHttp().getRequest<Request>();
    const user = await readSessionUser(req, this.jwt, this.prisma);
    if (!user) throw new UnauthorizedException();
    req.user = user;

    req.permissions ??= await this.permissions.effective(user.id);
    const missing = missingPermissions(req.permissions, required);
    if (missing.length > 0) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    return true;
  }
}
