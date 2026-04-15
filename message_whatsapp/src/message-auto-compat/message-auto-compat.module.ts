import { Module } from '@nestjs/common';
import { MessageAutoCompatController } from './message-auto-compat.controller';

@Module({
  controllers: [MessageAutoCompatController],
})
export class MessageAutoCompatModule {}
