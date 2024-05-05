import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { UserSchema } from '../user/user.schema';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private JwtService: JwtService,
    private userService: UserService) {}
    
  async register(user: UserSchema) {
    try {
      const doesUserExists = await this.userExists(user);
      if (!doesUserExists) {
        const saltOrRounds = 10;
        const encryptedPassword = await bcrypt.hash(user.password, saltOrRounds);
        const createdUser = await this.userService.createUser({...user, password: encryptedPassword} as any);
        if (createdUser) {
          return createdUser;
        }
      } else {
        throw new ConflictException('User already exists');
      }
    } catch (error) {
      throw new ConflictException(error.message);
    }
  }

  async userExists(user: UserSchema) {
    const userInstance = await this.userService.user({name: user.name} as any);
    return userInstance !== null;
  }

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.userService.user({email: username} as any);
    const isMatch = await bcrypt.compare(pass, user.password);
    if (user && isMatch) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: UserSchema) {
    const payload = { name: user.email, sub: user.password };
    const validation = await this.validateUser(payload.name, payload.sub);
    if (!validation) {
        throw new UnauthorizedException();
    }
    
    return {
        access_token: await this.JwtService.signAsync(payload),
    };
  }

  async getUsernameFromJwt(jwt: string) {
    const user = await this.JwtService.verifyAsync(jwt);
    return user;
  }
}
