import { Controller, Get } from '@nestjs/common';
import { type AnnouncementDto, AnnouncementsService } from './announcements.service';

/** Public. The banners to show now. */
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get('active')
  active(): Promise<AnnouncementDto[]> {
    return this.announcements.active();
  }
}
