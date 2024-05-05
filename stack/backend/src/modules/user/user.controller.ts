import {
  Controller,
  Req,
  Res,
  Get,
  Param,
  Post,
  Body,
  Put,
  Delete,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { UserService } from '../user/user.service';
import { User as UserModel } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { LocalAuthGuard } from '../auth/guards/local.guard';
import { UserSchema } from './user.schema';
import { AuthGuard } from '@nestjs/passport';

@Controller()
export class UserController {
  constructor(
    private readonly userService: UserService,
  ) {}
}