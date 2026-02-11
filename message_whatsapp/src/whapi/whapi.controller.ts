import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { metaToWhapi } from './utile/meta-to-whapi.service';
import { WhapiService } from './whapi.service';

import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Query,
  Get,
  ForbiddenException,
} from '@nestjs/common';

@Controller('webhooks')
export class WhapiController {
  constructor(private readonly whapiService: WhapiService) {}
  @Post('whapi')
  async handleWebhook(@Body() payload: WhapiWebhookPayload) {
    console.log('mon payload whapi==============', payload);
    const eventType = payload.event.type;
    try {
      switch (eventType) {
        case 'messages':
          // Traiter les messages
          // console.log('Événement messages:', payload.messages);
          await this.whapiService.handleIncomingMessage(payload);

          break;
        case 'statuses':
          // Traiter les statuts
          // console.log('Événement statuses:', payload.statuses);

          await this.whapiService.updateStatusMessage(payload);

          break;
        case 'events':
          // Traiter les événements (calls, joins, etc.)
          console.log('Événement events:', payload.events);
          break;
        case 'polls':
          // Traiter les sondages
          console.log('Événement polls:', payload.polls);
          break;
        case 'interactive':
          // Traiter les interactions (boutons, listes)
          console.log('Événement interactive:', payload.interactives);
          break;
        case 'contacts':
          // Traiter les contacts
          console.log('Événement contacts:', payload.contacts);
          break;
        case 'locations':
          // Traiter les localisations
          console.log('Événement locations:', payload.locations);
          break;
        case 'live_locations':
          // Traiter les localisations en direct
          console.log('Événement live_locations:', payload.live_locations);
          break;
        // case 'hsm':
        //   // Traiter les HSM (templates)
        //   console.log('Événement hsm:', payload.hsms);
        //   break;
        case 'orders':
          // Traiter les commandes
          console.log('Événement orders:', payload.orders);
          break;
        case 'products':
          // Traiter les produits
          console.log('Événement products:', payload.products);
          break;
        case 'catalogs':
          // Traiter les catalogues
          console.log('Événement catalogs:', payload.catalogs);
          break;
        // case 'invites':
        //   // Traiter les invitations
        //   console.log('Événement invites:', payload.invites);
        //   break;
        default:
          throw new HttpException(
            `Unsupported event type: ${eventType}`,
            HttpStatus.BAD_REQUEST,
          );
      }
    } catch (err) {
      throw new HttpException(
        {
          status: 'error',
          message: err.message || 'Webhook processing failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return { status: 'ok' };
  }

  @Get('whatsapp')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    console.log("cool",{
      mode: mode,
      token: token,
      challange: challenge,
    });


    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return challenge;
    }
    throw new ForbiddenException();
  }
  @Post('whatsapp')
  async handleWebhooks(@Body() payload: any) {
    console.log('📩 Event WhatsApp:', JSON.stringify(payload, null, 2));
    const payloads = metaToWhapi(payload);
    console.log('mon payload', payloads);
    if (!payloads) {
      return;
    }
    await this.whapiService.handleIncomingMessage(payload);

    return 'EVENT_RECEIVED';
  }
}
// https://kasie-gooier-sanford.ngrok-free.dev/webhooks/whapi
