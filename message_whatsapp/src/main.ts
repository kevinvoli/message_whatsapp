import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EventEmitter } from 'events';
import { ValidationPipe } from '@nestjs/common';
import { AdminService } from './admin/admin.service';
import { AppLogger } from './logging/app-logger.service';
import * as cookieParser from 'cookie-parser';
import * as helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  EventEmitter.defaultMaxListeners = 50;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // Serve uploaded media files
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });
  const appLogger = app.get(AppLogger);
  app.useLogger(appLogger);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Security headers (P1.5)
  app.use(
    (helmet as any)({
      contentSecurityPolicy: false, // désactivé car l'API est JSON — à activer côté Nginx
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Use cookie-parser middleware
  app.use(cookieParser());

  // Enable CORS for the frontend application
  // CORS_ORIGINS = liste d'origines séparées par des virgules
  // ex: http://148.230.112.175:3000,http://148.230.112.175:3001
  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Autoriser les requêtes sans origin (ex: Postman, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin "${origin}" non autorisée`));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Get the AdminService and ensure admin user exists
  const adminService = app.get(AdminService);
  await adminService.ensureAdminUserExists();

  // Start the application on the port defined in the .env file
  await app.listen(process.env.SERVER_PORT ?? 3002, '0.0.0.0');
}
bootstrap();
