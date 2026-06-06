import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PubSubService } from './pubsub.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PubSubService],
  exports: [PubSubService],
})
export class EventsModule {}
