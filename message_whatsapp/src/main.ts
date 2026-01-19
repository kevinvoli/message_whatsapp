import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EventEmitter } from 'events';



async function bootstrap() {
   EventEmitter.defaultMaxListeners = 0;
  const app = await NestFactory.create(AppModule);

  // Enable CORS for the frontend application
  app.enableCors({
    origin: '*', // T
    // he origin of the frontend app
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Start the application on the port defined in the .env file
  await app.listen(process.env.SERVER_PORT ?? 3002, '0.0.0.0');
}
bootstrap();
