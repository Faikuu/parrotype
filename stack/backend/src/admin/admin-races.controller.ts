import { Controller, Delete, Get, HttpCode, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import type { RoomSummary } from '../races/room.service';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { AdminService } from './admin.service';

/** The live race rooms. A plain list (not paged): rooms live in memory and the list is short. */
@Controller('admin/races')
@UseGuards(PermissionsGuard)
export class AdminRacesController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @RequirePermissions('races.read')
  list(): RoomSummary[] {
    return this.admin.listRaces();
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('races.manage')
  close(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.admin.closeRace(me, id);
  }
}
