import { WhatsappCommercial } from "../entities/user.entity";

export type SafeWhatsappCommercial = Omit<
  WhatsappCommercial,
  'password' | 'passwordResetToken' | 'passwordResetExpires' | 'salt' | 'validatePassword'| 'passwordHash'
>;
