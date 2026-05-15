import { PartialType } from '@nestjs/mapped-types';
import { CreateCampaignLinkDto } from './create-campaign-link.dto';

export class UpdateCampaignLinkDto extends PartialType(CreateCampaignLinkDto) {}
