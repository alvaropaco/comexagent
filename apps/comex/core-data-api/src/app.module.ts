import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { MongoModule } from './common/database/mongo.module';
import { EventsModule } from './common/events/events.module';
import { OutboxModule } from './common/outbox/outbox.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { BuyersModule } from './modules/buyers/buyers.module';
import { HealthModule } from './modules/health/health.module';
import { MarketModule } from './modules/market/market.module';
import { MatchesModule } from './modules/matches/matches.module';
import { NewsModule } from './modules/news/news.module';
import { SalesModule } from './modules/sales/sales.module';
import { VectorModule } from './modules/vector/vector.module';
import { ToolsModule } from './tools/tools.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongoModule,
    EventsModule,
    OutboxModule,
    VectorModule,
    HealthModule,
    ToolsModule,
    MarketModule,
    SalesModule,
    BuyersModule,
    MatchesModule,
    AlertsModule,
    NewsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
