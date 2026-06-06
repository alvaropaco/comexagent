import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import OpenAI from 'openai';
import { ClientSession, Model } from 'mongoose';
import { VectorDoc, VectorDocDocument } from './vector.schema';

@Injectable()
export class VectorService {
  private readonly openai?: OpenAI;
  private readonly embeddingModel: string;

  constructor(
    @InjectModel(VectorDoc.name)
    private readonly vectorModel: Model<VectorDocDocument>,
    private readonly config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.embeddingModel =
      this.config.get<string>('OPENAI_EMBEDDING_MODEL') ??
      'text-embedding-3-small';
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.openai) {
      const env = (
        this.config.get<string>('NODE_ENV') ??
        process.env.NODE_ENV ??
        'development'
      ).toLowerCase();
      if (env === 'production') {
        throw new Error('OPENAI_API_KEY not configured');
      }
      return new Array(1536).fill(0);
    }

    const resp = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });

    return resp.data[0].embedding;
  }

  async store(
    doc: { text: string; metadata: Record<string, unknown> },
    session?: ClientSession,
  ): Promise<void> {
    const embedding = await this.embed(doc.text);
    await this.vectorModel.create(
      [
        {
          text: doc.text,
          embedding,
          metadata: doc.metadata,
          embeddingModel: this.embeddingModel,
        },
      ],
      session ? { session } : undefined,
    );
  }

  async search(dto: {
    query: string;
    k: number;
    filter?: Record<string, unknown>;
  }) {
    const queryVec = await this.embed(dto.query);
    const filter = dto.filter ?? {};

    const pipeline: any[] = [
      {
        $vectorSearch: {
          index:
            this.config.get<string>('MONGO_VECTOR_INDEX') ??
            'memory_embedding_v1',
          path: 'embedding',
          queryVector: queryVec,
          numCandidates: 200,
          limit: dto.k,
          filter,
        },
      },
      {
        $project: {
          text: 1,
          metadata: 1,
          embeddingModel: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    const results = await this.vectorModel.aggregate(pipeline);
    if (Array.isArray(results) && results.length > 0) {
      return results;
    }

    const tokens = dto.query
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3)
      .slice(0, 8);
    const regex = tokens.length
      ? new RegExp(
          tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
          'i',
        )
      : /.^/;

    const docs = await this.vectorModel
      .find(
        {
          ...(filter as any),
          text: regex,
        },
        { text: 1, metadata: 1, embeddingModel: 1 },
      )
      .sort({ createdAt: -1 })
      .limit(dto.k)
      .lean();

    return docs.map((d) => ({ ...d, score: 0 }));
  }

  async count() {
    const count = await this.vectorModel.estimatedDocumentCount();
    return { count };
  }

  async recent(limit = 10) {
    const docs = await this.vectorModel
      .find({}, { text: 1, metadata: 1, embeddingModel: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(50, limit)))
      .lean();
    return { docs };
  }

  async existsByMetadataHash(hash: string) {
    if (!hash) return false;
    const found = await this.vectorModel
      .findOne({ 'metadata.hash': hash }, { _id: 1 })
      .lean();
    return !!found;
  }
}
