import { getEnv } from '../config/env';

/** The one JWT configuration: the session cookie is signed here and verified in every module that reads it. */
export const jwtModuleOptions = () => ({
  secret: getEnv().JWT_SECRET,
  signOptions: { algorithm: 'HS256' as const, expiresIn: '7d' },
});
