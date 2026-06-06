import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PubSub } from '@google-cloud/pubsub';

@Injectable()
export class PubSubService {
  private readonly logger = new Logger(PubSubService.name);
  private readonly enabled: boolean;
  private readonly topicName: string;
  private readonly pubsub?: PubSub;

  constructor(private readonly config: ConfigService) {
    this.enabled =
      (this.config.get<string>('PUBSUB_ENABLED') ?? '').toLowerCase() ===
      'true';
    this.topicName =
      this.config.get<string>('PUBSUB_TOPIC') ?? 'comex.domain-events.v1';

    if (this.enabled) {
      this.pubsub = new PubSub();
      this.logger.log(`Pub/Sub enabled (topic=${this.topicName})`);
    } else {
      this.logger.log('Pub/Sub disabled');
    }
  }

  async publish(eventType: string, event: unknown): Promise<void> {
    if (!this.enabled || !this.pubsub) {
      return;
    }

    const maxAttempts = Number(
      this.config.get<string>('PUBSUB_PUBLISH_ATTEMPTS') ?? '5',
    );
    let attempt = 0;
    let lastErr: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        await this.pubsub.topic(this.topicName).publishMessage({
          json: { event_type: eventType, event },
        });
        return;
      } catch (e) {
        lastErr = e;
        const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
        this.logger.warn(`Publish failed (attempt=${attempt}/${maxAttempts})`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    throw lastErr;
  }
}
