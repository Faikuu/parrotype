import { Module } from '@nestjs/common';
import { UserEvents } from './user-events';

/**
 * Provides the one UserEvents instance. Modules that emit or listen import this module; it imports
 * nothing itself, so there is no circular import between admin and races.
 */
@Module({
  providers: [UserEvents],
  exports: [UserEvents],
})
export class UserEventsModule {}
