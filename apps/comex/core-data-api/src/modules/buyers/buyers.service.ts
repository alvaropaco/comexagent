import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { OutboxService } from '../../common/outbox/outbox.service';
import { VectorService } from '../vector/vector.service';
import { CreateBuyOrderDto } from './dto/create-buy-order.dto';
import { BuyOrder, BuyOrderDocument } from './buy-order.schema';

@Injectable()
export class BuyersService {
  constructor(
    @InjectModel(BuyOrder.name)
    private readonly buyModel: Model<BuyOrderDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly outbox: OutboxService,
    private readonly vector: VectorService,
  ) {}

  async create(dto: CreateBuyOrderDto, idempotencyKey?: string) {
    const session = await this.connection.startSession();
    try {
      let created: BuyOrderDocument;
      await session.withTransaction(async () => {
        if (idempotencyKey) {
          const existing = await this.buyModel
            .findOne({ idempotencyKey })
            .session(session);
          if (existing) {
            created = existing;
            return;
          }
        }

        created = await this.buyModel
          .create([{ ...dto }], { session })
          .then((d) => d[0]);
        if (idempotencyKey) {
          created.idempotencyKey = idempotencyKey;
          await created.save({ session });
        }

        const text =
          `${dto.commodity} ${dto.destination ?? ''} ${dto.targetPrice} ${dto.currency} ${dto.volume}`
            .trim()
            .replace(/\s+/g, ' ');

        await this.vector.store(
          {
            text,
            metadata: {
              type: 'buy_order',
              buyOrderId: String(created._id),
              commodity: dto.commodity,
            },
          },
          session,
        );

        await this.outbox.enqueue(
          'BUY_ORDER_CREATED',
          {
            buyOrderId: String(created._id),
            commodity: dto.commodity,
            destination: dto.destination ?? null,
          },
          session,
        );
      });

      return created!.toObject();
    } finally {
      session.endSession();
    }
  }

  async findAll() {
    return this.buyModel.find().sort({ createdAt: -1 }).lean();
  }

  async findByCommodity(commodity: string) {
    return this.buyModel.find({ commodity }).lean();
  }
}
