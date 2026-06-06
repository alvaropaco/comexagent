import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { OutboxService } from '../../common/outbox/outbox.service';
import { VectorService } from '../vector/vector.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { Sale, SaleDocument } from './sales.schema';

@Injectable()
export class SalesService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly outbox: OutboxService,
    private readonly vector: VectorService,
  ) {}

  async create(dto: CreateSaleDto, idempotencyKey?: string) {
    const session = await this.connection.startSession();
    try {
      let created: SaleDocument;
      await session.withTransaction(async () => {
        if (idempotencyKey) {
          const existing = await this.saleModel
            .findOne({ idempotencyKey })
            .session(session);
          if (existing) {
            created = existing;
            return;
          }
        }

        created = await this.saleModel
          .create([{ ...dto }], { session })
          .then((d) => d[0]);
        if (idempotencyKey) {
          created.idempotencyKey = idempotencyKey;
          await created.save({ session });
        }

        const text =
          `${dto.commodity} ${dto.incoterm} ${dto.origin ?? ''} ${dto.destination ?? ''} ${dto.price} ${dto.currency} ${dto.volume}`
            .trim()
            .replace(/\s+/g, ' ');

        await this.vector.store(
          {
            text,
            metadata: {
              type: 'sale',
              saleId: String(created._id),
              commodity: dto.commodity,
            },
          },
          session,
        );

        await this.outbox.enqueue(
          'SALE_CREATED',
          {
            saleId: String(created._id),
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
    return this.saleModel.find().sort({ createdAt: -1 }).lean();
  }

  async findById(id: string) {
    return this.saleModel.findById(id).lean();
  }
}
