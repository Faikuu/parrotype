import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Page } from '../common/pagination';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import {
  banInputSchema,
  userDeleteSchema,
  userGroupsSchema,
  userListQuerySchema,
  userRenameSchema,
  type BanInput,
  type UserDeleteInput,
  type UserGroupsInput,
  type UserListQuery,
  type UserRenameInput,
} from './admin.schemas';
import { AdminUsersService, type AdminUserDetail, type AdminUserRow } from './admin-users.service';

@Controller('admin/users')
@UseGuards(PermissionsGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @RequirePermissions('users.read')
  list(@Query(new ZodValidationPipe(userListQuerySchema)) query: UserListQuery): Promise<Page<AdminUserRow>> {
    return this.users.list(query);
  }

  @Get(':id')
  @RequirePermissions('users.read')
  detail(@Param('id', ParseIntPipe) id: number): Promise<AdminUserDetail> {
    return this.users.detail(id);
  }

  @Patch(':id')
  @RequirePermissions('users.edit')
  rename(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(userRenameSchema)) body: UserRenameInput,
  ): Promise<AdminUserRow> {
    return this.users.rename(me, id, body.name);
  }

  @Post(':id/revoke-sessions')
  @HttpCode(200)
  @RequirePermissions('users.edit')
  revokeSessions(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    return this.users.revokeSessions(me, id);
  }

  /** Turns off the user's two-factor sign-in and deletes their recovery codes. Their sessions end. */
  @Post(':id/2fa/reset')
  @HttpCode(200)
  @RequirePermissions('users.security')
  reset2fa(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    return this.users.reset2fa(me, id);
  }

  @Post(':id/ban')
  @HttpCode(200)
  @RequirePermissions('users.ban')
  ban(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(banInputSchema)) body: BanInput,
  ): Promise<AdminUserRow> {
    return this.users.ban(me, id, body.reason);
  }

  @Post(':id/unban')
  @HttpCode(200)
  @RequirePermissions('users.ban')
  unban(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<AdminUserRow> {
    return this.users.unban(me, id);
  }

  /** Name-based aliases of the 2.3 routes (/admin/users/:name/ban). They sit under by-name/ because the id route needs the segment. */
  @Post('by-name/:name/ban')
  @HttpCode(200)
  @RequirePermissions('users.ban')
  async banByName(
    @CurrentUser() me: AuthUser,
    @Param('name') name: string,
    @Body(new ZodValidationPipe(banInputSchema)) body: BanInput,
  ): Promise<AdminUserRow> {
    return this.users.ban(me, await this.users.idForName(name), body.reason);
  }

  @Post('by-name/:name/unban')
  @HttpCode(200)
  @RequirePermissions('users.ban')
  async unbanByName(@CurrentUser() me: AuthUser, @Param('name') name: string): Promise<AdminUserRow> {
    return this.users.unban(me, await this.users.idForName(name));
  }

  @Put(':id/groups')
  @HttpCode(200)
  @RequirePermissions('users.groups')
  setGroups(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(userGroupsSchema)) body: UserGroupsInput,
  ): Promise<AdminUserRow> {
    return this.users.setGroups(me, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('users.delete')
  remove(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(userDeleteSchema)) body: UserDeleteInput,
  ): Promise<{ ok: true }> {
    return this.users.remove(me, id, body);
  }
}
