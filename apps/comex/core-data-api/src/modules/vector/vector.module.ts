import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VectorController } from './vector.controller';
import { VectorDoc, VectorDocSchema } from './vector.schema';
import { VectorService } from './vector.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VectorDoc.name, schema: VectorDocSchema },
    ]),
  ],
  controllers: [VectorController],
  providers: [VectorService],
  exports: [VectorService],
})
export class VectorModule {}
