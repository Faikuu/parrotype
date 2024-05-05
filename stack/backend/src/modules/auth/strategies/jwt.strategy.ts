import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable } from "@nestjs/common";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
              (request) => {
                let token = null;
                if (request && request.cookies) {
                  token = request.cookies['app_token'];
                }
                return token;
              },
            ]),
            ignoreExpiration: false,
            secretOrKey: 'jwt'
          });
    }

    async validate(payload: any) {
      return { userId: payload.sub, username: payload.username };
    }
}