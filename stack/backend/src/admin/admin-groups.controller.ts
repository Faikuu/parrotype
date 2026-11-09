import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { pageQuerySchema } from '../common/pagination';
import type { Page, PageQuery } from '../common/pagination';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import {
  groupCreateSchema,
  groupPermissionsSchema,
  groupUpdateSchema,
  type GroupCreateInput,
  type GroupPermissionsInput,
  type GroupUpdateInput,
} from './admin.schemas';
import {
  AdminGroupsService,
  type AdminGroup,
  type AdminGroupDetail,
  type GroupMember,
  type GroupWriteResult,
} from './admin-groups.service';

@Controller('admin/groups')
@UseGuards(PermissionsGuard)
export class AdminGroupsController {
  constructor(private readonly groups: AdminGroupsService) {}

  @Get()
  @RequirePermissions('groups.read')
  list(@Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery): Promise<Page<AdminGroup>> {
    return this.groups.list(query);
  }

  @Post()
  @RequirePermissions('groups.manage')
  create(
    @CurrentUser() me: AuthUser,
    @Body(new ZodValidationPipe(groupCreateSchema)) body: GroupCreateInput,
  ): Promise<GroupWriteResult> {
    return this.groups.create(me, body);
  }

  @Get(':id')
  @RequirePermissions('groups.read')
  detail(@Param('id', ParseIntPipe) id: number): Promise<AdminGroupDetail> {
    return this.groups.detail(id);
  }

  @Patch(':id')
  @RequirePermissions('groups.manage')
  update(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(groupUpdateSchema)) body: GroupUpdateInput,
  ): Promise<AdminGroup> {
    return this.groups.update(me, id, body);
  }

  @Put(':id/permissions')
  @HttpCode(200)
  @RequirePermissions('groups.manage')
  setPermissions(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(groupPermissionsSchema)) body: GroupPermissionsInput,
  ): Promise<GroupWriteResult> {
    return this.groups.setPermissions(me, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('groups.manage')
  remove(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    return this.groups.remove(me, id);
  }

  @Put(':groupId/members/:userId')
  @HttpCode(200)
  @RequirePermissions('users.groups')
  addMember(
    @CurrentUser() me: AuthUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<GroupMember> {
    return this.groups.addMember(me, groupId, userId);
  }

  @Delete(':groupId/members/:userId')
  @HttpCode(200)
  @RequirePermissions('users.groups')
  removeMember(
    @CurrentUser() me: AuthUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<{ ok: true }> {
    return this.groups.removeMember(me, groupId, userId);
  }
}
