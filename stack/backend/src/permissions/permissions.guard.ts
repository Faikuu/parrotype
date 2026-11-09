import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { readSessionClaims, type AuthUser } from '../auth/jwt-auth.guard';
import { ADMIN_ACCESS, type Permission } from './catalog';
import { REQUIRED_PERMISSIONS } from './permissions.decorator';
import { PermissionsService } from './permissions.service';
import { missingPermissions, resolveEffective } from './rules';

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
 * Checks the verified session, then the route's @RequirePermissions keys. No session, a token that no
 * longer matches the account, or a suspended account is 401. A missing permission is 403. The account and its
 * permissions come from one database statement per request, so a revoked permission takes effect at once.
 * The permissions are cached on req.permissions for the rest of the request.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<Permission[] | undefined>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [ADMIN_ACCESS];

    const req = context.switchToHttp().getRequest<Request>();
    const claims = await readSessionClaims(req, this.jwt);
    if (!claims) throw new UnauthorizedException();
    const account = await this.permissions.loadAccount(claims.sub);
    if (!account || account.banned || claims.version !== account.tokenVersion) throw new UnauthorizedException();

    const user: AuthUser = { id: account.id, name: account.name };
    req.user = user;
    req.permissions ??= resolveEffective(account.groups, false);
    const missing = missingPermissions(req.permissions, required);
    if (missing.length > 0) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    return true;
  }
}
