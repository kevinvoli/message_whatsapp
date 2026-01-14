import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateWhatsappCustomerDto } from './dto/create-whatsapp_customer.dto';
import { UpdateWhatsappCustomerDto } from './dto/update-whatsapp_customer.dto';
import { WhatsappCustomer } from './entities/whatsapp_customer.entity';

@Injectable()
export class WhatsappCustomerService {
  constructor(
    @InjectRepository(WhatsappCustomer)
    private readonly customerRepository: Repository<WhatsappCustomer>,
  ) {}

  async create(createWhatsappCustomerDto: CreateWhatsappCustomerDto): Promise<WhatsappCustomer> {
    const customer = this.customerRepository.create(createWhatsappCustomerDto);
    return this.customerRepository.save(customer);
  }

  async findAll(): Promise<WhatsappCustomer[]> {
    return this.customerRepository.find();
  }

  async findOne(id: string): Promise<WhatsappCustomer> {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    return customer;
  }

  async update(id: string, updateWhatsappCustomerDto: UpdateWhatsappCustomerDto): Promise<WhatsappCustomer> {
    const customer = await this.findOne(id);
    Object.assign(customer, updateWhatsappCustomerDto);
    return this.customerRepository.save(customer);
  }

  async remove(id: string): Promise<void> {
    const customer = await this.findOne(id);
    await this.customerRepository.remove(customer);
  }
}
