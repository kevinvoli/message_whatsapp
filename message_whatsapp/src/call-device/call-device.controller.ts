import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from 'src/auth/admin.guard';
import { CallDeviceService, UpdateCallDeviceDto } from './call-device.service';
import { CallDevice } from './entities/call-device.entity';

@ApiTags('Call Devices Admin')
@Controller('admin/call-devices')
@UseGuards(AdminGuard)
export class CallDeviceController {
  constructor(private readonly callDeviceService: CallDeviceService) {}

  @Get()
  @ApiOperation({ summary: 'Liste tous les appareils connus (admin)' })
  findAll(): Promise<CallDevice[]> {
    return this.callDeviceService.findAll();
  }

  @Patch(':deviceId')
  @ApiOperation({ summary: 'Associe un poste ou modifie le label d un appareil (admin)' })
  update(
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdateCallDeviceDto,
  ): Promise<CallDevice> {
    return this.callDeviceService.updateDevice(deviceId, dto);
  }

  @Delete(':deviceId/poste')
  @ApiOperation({ summary: 'Dissocie le poste d un appareil (admin)' })
  dissociate(@Param('deviceId') deviceId: string): Promise<CallDevice> {
    return this.callDeviceService.dissociate(deviceId);
  }
}
