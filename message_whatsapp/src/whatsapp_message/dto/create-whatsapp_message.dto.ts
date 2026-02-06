export class CreateWhatsappMessageDto {
    chat_id: string;
    text: string;
    poste_id: string; // Added
    channel_id: string; // Added
    timestamp:number
}