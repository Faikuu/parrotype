import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    private readonly jwtStrategy: JwtStrategy
    
    constructor(
    ) {
        this.jwtStrategy = new JwtStrategy();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();

        const reqToken = this.extractJwtTokenFromRequest(request);;

        if (!reqToken) {
            return false;
        }

        try {
            const user = await this.jwtStrategy.validate(
                this.decodeToken(reqToken),
            );

            if (user) {
                request.user = user;
                return true;
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    private extractJwtTokenFromRequest(request: any): string | null {
        let token = null;
        if (request && request.cookies) {
            token = request.cookies['app_token'];
        }
        return token;
    }

    private decodeToken(token: string): any {
        const jwtService = new JwtService();
        const decodedToken = jwtService.decode(token);
        return decodedToken;
    }
}