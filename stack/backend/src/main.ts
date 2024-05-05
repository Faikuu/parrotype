import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as passport from 'passport';
import * as session from 'express-session';
import Redis from 'ioredis';
import connectRedis from 'connect-redis';
import { ValidationPipe } from '@nestjs/common';
import { ApiResponseInterceptor } from './interceptors/apiResponse.interceptor';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.enableShutdownHooks();
  
  const redisClient = new Redis({
      password: '123456',
      port: 6380,
  });
  const RedisStore = new connectRedis({client: redisClient});

  app.use(
    session({
        store: RedisStore,
        secret: '125A6SD1AS56D1',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 6 * 60 * 60 * 3600,

            secure: true,
        },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe());

  app.useGlobalInterceptors(new ApiResponseInterceptor());

  app.setGlobalPrefix(process.env.BACKEND_PREFIX || '');

  await app.listen(process.env.BACKEND_PORT || 3000);
}
bootstrap();
