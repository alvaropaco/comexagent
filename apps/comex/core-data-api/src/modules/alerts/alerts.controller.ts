import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AlertsService } from './alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Post()
  create(@Body() dto: CreateAlertDto) {
    return this.alerts.create(dto);
  }

  @Get()
  list(@Query('userId') userId?: string) {
    return this.alerts.list(userId);
  }
}
