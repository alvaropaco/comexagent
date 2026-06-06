import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OutboxService } from '../../common/outbox/outbox.service';
import { Alert, AlertDocument } from './alert.schema';
import { CreateAlertDto } from './dto/create-alert.dto';

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(Alert.name) private readonly alertModel: Model<AlertDocument>,
    private readonly outbox: OutboxService,
  ) {}

  async create(dto: CreateAlertDto) {
    const created = await this.alertModel.create(dto);
    await this.outbox.enqueue('ALERT_CREATED', {
      alertId: String(created._id),
      userId: dto.userId,
      type: dto.type,
    });
    return created.toObject();
  }

  async list(userId?: string) {
    const filter = userId ? { userId } : {};
    return this.alertModel.find(filter).sort({ createdAt: -1 }).lean();
  }
}
