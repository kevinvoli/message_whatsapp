import { MessagingApplication } from '../entities/messaging-application.entity';

export class ApplicationResponseDto {
  id: string;
  label: string;
  provider: string;
  appId: string;
  channelCount?: number;
  createdAt: Date;
  updatedAt: Date;

  static from(app: MessagingApplication, channelCount?: number): ApplicationResponseDto {
    const dto = new ApplicationResponseDto();
    dto.id = app.id;
    dto.label = app.label;
    dto.provider = app.provider;
    dto.appId = app.appId;
    dto.channelCount = channelCount;
    dto.createdAt = app.createdAt;
    dto.updatedAt = app.updatedAt;
    return dto;
  }
}
