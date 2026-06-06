import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BuyersService } from '../buyers/buyers.service';
import { SalesService } from '../sales/sales.service';
import { Match, MatchDocument } from './match.schema';

@Injectable()
export class MatchesService {
  constructor(
    @InjectModel(Match.name) private readonly matchModel: Model<MatchDocument>,
    private readonly sales: SalesService,
    private readonly buyers: BuyersService,
  ) {}

  async explainTopMatchesForSale(saleId: string, limit: number) {
    const sale = await this.sales.findById(saleId);
    if (!sale) {
      return [];
    }

    const buyers = await this.buyers.findByCommodity(sale.commodity);
    const candidates = buyers
      .map((b) => {
        const destinationMatch =
          sale.destination &&
          b.destination &&
          sale.destination.toLowerCase() === b.destination.toLowerCase();
        const score =
          0.7 +
          (destinationMatch ? 0.2 : 0) +
          (b.targetPrice >= sale.price ? 0.1 : 0);
        return {
          saleId,
          buyOrderId: String(b._id),
          score: Math.max(0, Math.min(1, score)),
          reason: destinationMatch
            ? 'Same destination and target price supports the sale price.'
            : 'Commodity match; destination/price heuristics applied.',
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return candidates;
  }

  async upsertMatches(saleId: string, limit: number) {
    const explanations = await this.explainTopMatchesForSale(saleId, limit);

    for (const ex of explanations) {
      await this.matchModel.updateOne(
        {
          saleId: new Types.ObjectId(ex.saleId),
          buyOrderId: new Types.ObjectId(ex.buyOrderId),
        },
        {
          $set: {
            score: ex.score,
            status: 'ACTIVE',
          },
        },
        { upsert: true },
      );
    }

    return explanations;
  }

  async listForSale(saleId: string) {
    return this.matchModel
      .find({ saleId: new Types.ObjectId(saleId) })
      .sort({ score: -1 })
      .lean();
  }
}
