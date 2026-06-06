import {
  Body,
  Controller,
  Headers,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DailySyncService } from './daily-sync.service';
import { ExternalDataService } from './external-data.service';

@Controller('external')
export class ExternalDataController {
  private readonly token?: string;

  constructor(
    private readonly external: ExternalDataService,
    private readonly daily: DailySyncService,
    private readonly config: ConfigService,
  ) {
    this.token = this.config.get<string>('EXTERNAL_TOOL_TOKEN');
  }

  @Post('ingest')
  async ingest(
    @Headers('x-external-tool-token') token: string | undefined,
    @Body() body: { query?: string; force?: boolean },
  ) {
    const env = (
      this.config.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      'development'
    ).toLowerCase();
    if (env === 'production') {
      if (!this.token) {
        throw new HttpException(
          'EXTERNAL_TOOL_TOKEN not configured',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      const provided = (token ?? '').trim();
      const expected = this.token.trim();
      if (!provided || provided !== expected) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
    }

    const force = !!body.force;
    return this.external.ingestFromQuery(body.query ?? '', {
      force,
      maxResults: force ? 10 : 5,
      perQueryLimit: force ? 3 : 2,
    });
  }

  @Post('daily-sync')
  async dailySync(@Headers('x-external-tool-token') token: string | undefined) {
    const env = (
      this.config.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      'development'
    ).toLowerCase();
    if (env === 'production') {
      if (!this.token) {
        throw new HttpException(
          'EXTERNAL_TOOL_TOKEN not configured',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      const provided = (token ?? '').trim();
      const expected = this.token.trim();
      if (!provided || provided !== expected) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
    }

    return this.daily.runOnce();
  }
}
