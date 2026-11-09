import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { jwtModuleOptions } from '../auth/jwt.options';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsService } from './permissions.service';

/**
 * Global, so any module can guard a route with @UseGuards(PermissionsGuard) or inject PermissionsService.
 * It exports JwtModule because the guard verifies the session cookie.
 */
@Global()
@Module({
  imports: [JwtModule.registerAsync({ useFactory: jwtModuleOptions })],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard, JwtModule],
})
export class PermissionsModule {}
