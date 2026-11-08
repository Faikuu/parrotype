import { Controller, Get, Param } from '@nestjs/common';
import { UsersService, type PublicProfile } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':name')
  profile(@Param('name') name: string): Promise<PublicProfile> {
    return this.users.profile(name);
  }
}
