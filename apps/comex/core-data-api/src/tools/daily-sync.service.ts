import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExternalDataService } from './external-data.service';

@Injectable()
export class DailySyncService {
  private readonly logger = new Logger(DailySyncService.name);

  constructor(private readonly external: ExternalDataService) {}

  @Cron('0 3 * * *')
  async dailySync() {
    await this.runOnce();
  }

  async runOnce() {
    const queries = [
      'coffee price Brazil latest',
      'pepper Vietnam export report latest',
      'coffee logistics Santos congestion latest',
      'global coffee supply forecast latest',
    ];

    let stored = 0;
    const started = Date.now();
    for (const q of queries) {
      try {
        const res = await this.external.ingestFromQuery(q, {
          force: true,
          maxResults: 5,
          perQueryLimit: 2,
        });
        if (typeof (res as any).stored === 'number')
          stored += (res as any).stored;
      } catch (e) {
        this.logger.warn(
          JSON.stringify({
            tool: 'daily_sync',
            ok: false,
            query: q,
            err: String(e),
          }),
        );
      }
    }

    const ms = Date.now() - started;
    this.logger.log(
      JSON.stringify({ tool: 'daily_sync', ok: true, ms, stored }),
    );
    return { ok: true, stored, ms };
  }
}
