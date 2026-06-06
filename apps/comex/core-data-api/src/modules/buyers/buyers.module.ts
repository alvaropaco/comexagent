import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VectorModule } from '../vector/vector.module';
import { BuyOrder, BuyOrderSchema } from './buy-order.schema';
import { BuyersController } from './buyers.controller';
import { BuyersService } from './buyers.service';

@Module({
  imports: [
    VectorModule,
    MongooseModule.forFeature([
      { name: BuyOrder.name, schema: BuyOrderSchema },
    ]),
  ],
  controllers: [BuyersController],
  providers: [BuyersService],
  exports: [BuyersService],
})
export class BuyersModule {}
