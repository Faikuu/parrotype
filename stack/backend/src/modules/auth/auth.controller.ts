import { Controller, Body, Get, Post, Req, Res, Param, UseGuards, Query, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Request, Response } from 'express';
import { UserSchema } from '../user/user.schema';
import { LocalAuthGuard } from './guards/local.guard';
import { JwtAuthGuard } from './guards/jwt.guard';

@Controller('/auth') 
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('/register')
    // @UseGuards(LocalAuthGuard)
    async register(
        @Body() loginModel: any,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response
    ) {
        const registerResponse = await this.authService.register(req.body as UserSchema);
        return registerResponse;
    }

    @Post('/login')
    // @UseGuards(LocalAuthGuard)
    async login(
        @Body() loginModel: any,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response
    ) {
        const { access_token } = await this.authService.login(req.body as UserSchema);
  
        if (access_token) {
            res.cookie('app_token', access_token, {
                httpOnly: true,
                sameSite: 'none',
                domain: process.env.COOKIE_DOMAIN,
                secure: true,
                expires: new Date(Date.now() + (1000 * 60 * 60 * 24 * 365 )),
            }); 
  
            return { access_token: access_token, user: req.body };
        }
    }

    @Post('/logout')
    @UseGuards(JwtAuthGuard)
    async logout(@Res({ passthrough: true }) res: Response) {
        res.clearCookie('app_token');
        res.clearCookie('user');
        return { success: true };
    }
}