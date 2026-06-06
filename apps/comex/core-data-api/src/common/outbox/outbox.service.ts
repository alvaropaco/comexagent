import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { PubSubService } from '../events/pubsub.service';
import { OutboxEvent, OutboxEventDocument } from './outbox.schema';

@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxService.name);
  private timer?: NodeJS.Timeout;
  private enabled = true;

  constructor(
    @InjectModel(OutboxEvent.name)
    private readonly outboxModel: Model<OutboxEventDocument>,
    private readonly pubsub: PubSubService,
  ) {
    this.enabled =
      (process.env.OUTBOX_ENABLED ?? 'true').toLowerCase() === 'true';
  }

  onModuleInit() {
    if (!this.enabled) {
      return;
    }
    const intervalMs = Number(process.env.OUTBOX_POLL_MS ?? '1000');
    this.timer = setInterval(
      () => this.drainOnce().catch(() => undefined),
      intervalMs,
    );
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async enqueue(
    eventType: string,
    event: Record<string, unknown>,
    session?: ClientSession,
  ) {
    await this.outboxModel.create(
      [{ eventType, event, status: 'PENDING' }],
      session ? { session } : undefined,
    );
  }

  async drainOnce() {
    const next = await this.outboxModel.findOneAndUpdate(
      { status: 'PENDING' },
      { $set: { status: 'FAILED' } },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    );

    if (!next) {
      return;
    }

    try {
      await this.pubsub.publish(next.eventType, next.event);
      await this.outboxModel.updateOne(
        { _id: next._id },
        { $set: { status: 'PUBLISHED', publishedAt: new Date() } },
      );
    } catch (e) {
      this.logger.warn(`Outbox publish failed id=${String(next._id)}`);
    }
  }
}
