import { IsString, IsNotEmpty, IsPhoneNumber } from 'class-validator';

export class CreateWhatsappCustomerDto {
  @IsString()
  @IsNotEmpty()
  customer_id: string;

  @IsPhoneNumber(null)
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}
