import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOptions = {
    origin: '*',
    methods: ['GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept'
    ],
    exposedHeaders: [
      'Authorization',
      'X-Token-Count'
    ]
  }
  app.enableCors(corsOptions)

//   volibigbamblekevin@gmail.com
// 88kevinCool*

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
