import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { readSessionUser } from './jwt-auth.guard';

/** Like JwtAuthGuard, but lets anonymous requests through with req.user unset. */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = await readSessionUser(req, this.jwt);
    if (user) req.user = user;
    return true;
  }
}
