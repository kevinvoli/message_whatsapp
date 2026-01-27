import { Injectable } from '@nestjs/common';
import { CreateCommunicationWhapiDto } from './dto/create-communication_whapi.dto';
import { UpdateCommunicationWhapiDto } from './dto/update-communication_whapi.dto';
import axios from 'axios';


@Injectable()
export class CommunicationWhapiService {

    private readonly WHAPI_URL = 'https://gate.whapi.cloud/messages/text';
  private readonly WHAPI_TOKEN = process.env.WHAPI_TOKEN;

  constructor() {}  

    async sendToWhapi(to: string, text: string): Promise<{
       id: string,
  status: number,
  statusText: string}> {  
    const response = await axios.post(
      this.WHAPI_URL,
      {
        to, // ex: "2250700000000"
        body: text,
      },
      {
        headers: {
          Authorization: `Bearer ${this.WHAPI_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    )

    
    return response.data as {
      id: string,
  status: number,
  statusText: string};
    
  } 

  

  create(createCommunicationWhapiDto: CreateCommunicationWhapiDto) {
    return 'This action adds a new communicationWhapi';
  }

  findAll() {
    return `This action returns all communicationWhapi`;
  }

  findOne(id: number) {
    return `This action returns a #${id} communicationWhapi`;
  }

  update(id: number, updateCommunicationWhapiDto: UpdateCommunicationWhapiDto) {
    return `This action updates a #${id} communicationWhapi`;
  }

  remove(id: number) {
    return `This action removes a #${id} communicationWhapi`;
  }

  async sendMedia(to: string, mediaUrl: string): Promise<any> {
    // This is a placeholder for the actual media sending logic.
    // The implementation will depend on the Whapi.cloud API for sending media.
    console.log(`Sending media to ${to} with URL ${mediaUrl}`);
    return Promise.resolve({ id: 'fake-media-id', status: 'sent' });
  }

  getMediaUrl(mediaId: string): string {
    return `https://gate.whapi.cloud/media/${mediaId}?token=${this.WHAPI_TOKEN}`;
  }
}
