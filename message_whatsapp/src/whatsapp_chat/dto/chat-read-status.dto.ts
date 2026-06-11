export class ChatReadStatusDto {
  lastReadAt: Date | null;
  lastReadByName: string | null;
  hasUnrespondedRead: boolean;
}
