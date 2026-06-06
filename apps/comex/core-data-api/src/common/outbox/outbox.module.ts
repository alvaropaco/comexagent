import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from '../events/events.module';
import { OutboxEvent, OutboxEventSchema } from './outbox.schema';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  imports: [
    EventsModule,
    MongooseModule.forFeature([
      { name: OutboxEvent.name, schema: OutboxEventSchema },
    ]),
  ],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
