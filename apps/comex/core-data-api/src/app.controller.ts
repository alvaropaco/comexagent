import { Controller, Get } from '@nestjs/common';

/** Root route so `GET /` returns service info instead of a 404. */
@Controller()
export class AppController {
  @Get()
  root() {
    return {
      ok: true,
      service: 'core-data-api',
      health: '/health',
    };
  }
}
