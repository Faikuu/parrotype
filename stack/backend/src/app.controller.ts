import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './modules/auth/auth.service';
import { Request } from 'express';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly authService: AuthService
    ) {}

  @Get("/helloworld")
  @UseGuards(AuthGuard('jwt'))
  async getHello(@Req() req: Request): Promise<string> {
    const app_token = req.cookies['app_token'];
    const username = await this.authService.getUsernameFromJwt(app_token as string);
    console.log(username);
    return this.appService.getHello();
  }
}
