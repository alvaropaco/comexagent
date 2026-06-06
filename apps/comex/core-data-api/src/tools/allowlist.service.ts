import { Injectable } from '@nestjs/common';

@Injectable()
export class AllowlistService {
  private readonly allowed = [
    'unctadstat.unctad.org',
    'wits.worldbank.org',
    'ipcnet.org',
    'vpsaspice.org',
    'comexlive.org',
  ];

  isAllowed(url: string) {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      return this.allowed.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  }
}
