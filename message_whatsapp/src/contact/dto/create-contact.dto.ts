export class CreateContactDto {
    phone: string;
    chat_id?: string |null; // chat_id is optional as it might be created later
    name: string;
}