import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkAttendance } from './entities/work-attendance.entity';
import { WorkAttendanceService } from './work-attendance.service';
import { WorkAttendanceController } from './work-attendance.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WorkAttendance])],
  controllers: [WorkAttendanceController],
  providers: [WorkAttendanceService],
  exports: [WorkAttendanceService],
})
export class WorkAttendanceModule {}
