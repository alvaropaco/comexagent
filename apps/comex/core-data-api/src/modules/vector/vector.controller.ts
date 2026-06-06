import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VectorSearchDto } from './dto/vector-search.dto';
import { VectorStoreDto } from './dto/vector-store.dto';
import { VectorService } from './vector.service';

@Controller('vector')
export class VectorController {
  private readonly token?: string;

  constructor(
    private readonly vector: VectorService,
    private readonly config: ConfigService,
  ) {
    this.token = this.config.get<string>('VECTOR_STORE_TOKEN');
  }

  @Get('count')
  count() {
    return this.vector.count();
  }

  @Get('recent')
  recent(@Query('limit') limit?: string) {
    return this.vector.recent(limit ? Number(limit) : 10);
  }

  @Post('search')
  search(@Body() dto: VectorSearchDto) {
    return this.vector.search({
      query: dto.query,
      k: dto.k ?? 5,
      filter: dto.filter,
    });
  }

  @Post('store')
  async store(
    @Headers('x-vector-store-token') token: string | undefined,
    @Body() dto: VectorStoreDto,
  ) {
    const env = (
      this.config.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      'development'
    ).toLowerCase();
    if (env === 'production') {
      if (!this.token) {
        throw new HttpException(
          'VECTOR_STORE_TOKEN not configured',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      const provided = (token ?? '').trim();
      const expected = this.token.trim();
      if (!provided || provided !== expected) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
    }

    await this.vector.store({ text: dto.text, metadata: dto.metadata });
    return { ok: true };
  }
}
