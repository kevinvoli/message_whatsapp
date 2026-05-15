
const fs = require('fs');
const path = 'C:/Users/gbamb/Desktop/projet/whatsapp/message_whatsapp/src/campaign-link/campaign-link.service.ts';

const content = [
  "import { createHash, randomBytes } from 'crypto';",
  "import { Injectable, Logger, NotFoundException } from '@nestjs/common';",
  "import { InjectRepository } from '@nestjs/typeorm';",
  "import { Between, IsNull, Repository } from 'typeorm';",
  "import { CampaignLink } from './entities/campaign-link.entity';",
  "import { CampaignLinkClick } from './entities/campaign-link-click.entity';",
  "import { WhapiChannel } from 'src/channel/entities/channel.entity';",
  "import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';",
  "import { CreateCampaignLinkDto } from './dto/create-campaign-link.dto';",
  "import { UpdateCampaignLinkDto } from './dto/update-campaign-link.dto';",
  "import { MediaAssetService } from 'src/media-asset/media-asset.service';",
  "import { CreateMediaAssetDto } from 'src/media-asset/dto/create-media-asset.dto';",
].join('\n');
console.log('imports:', content.length, 'chars');
fs.writeFileSync(path, content, 'utf8');
console.log('Written OK');
