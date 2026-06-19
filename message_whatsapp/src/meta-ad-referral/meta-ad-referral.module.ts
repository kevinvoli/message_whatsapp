import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaAdReferral } from './entities/meta-ad-referral.entity';
import { MetaAdReferralService } from './meta-ad-referral.service';

@Module({
  imports: [TypeOrmModule.forFeature([MetaAdReferral])],
  providers: [MetaAdReferralService],
  exports: [MetaAdReferralService],
})
export class MetaAdReferralModule {}
