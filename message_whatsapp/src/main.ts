import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EventEmitter } from 'events';
import { ValidationPipe } from '@nestjs/common';
import { AdminService } from './admin/admin.service';

async function bootstrap() {
   EventEmitter.defaultMaxListeners = 0;
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:true,
      forbidNonWhitelisted:true,
      transform:true
    })
  )

  // Enable CORS for the frontend application
  app.enableCors({
    origin: '*', // T
    // he origin of the frontend app
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