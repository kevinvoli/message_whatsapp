import { Controller, Get, UseGuards } from '@nestjs/common';
import { FeatureFlagService } from './feature-flag.service';
import { AdminGuard } from '../auth/admin.guard';

@Controller('feature-flags')
@UseGuards(AdminGuard)
export class FeatureFlagController {
  constructor(private readonly featureFlagService: FeatureFlagService) {}

  @Get()
  getAll() {
    return this.featureFlagService.getAllFlags();
  }
}
