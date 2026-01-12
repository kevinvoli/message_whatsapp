import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { WhapiService } from './whapi.service';

import { Controller, Post, Body } from '@nestjs/common';


@Controller('webhooks/whapi')
export class WhapiController {
  constructor(private readonly whapiService: WhapiService) {}
   @Post()
   handleWebhook(@Body() payload: WhapiWebhookPayload) {
    console.log("mon payload whapi", payload);
    
     this.whapiService.handleIncomingMessage(payload);
    return { status: 'ok' };
  }
 

}
