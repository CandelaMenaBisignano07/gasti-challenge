import { Injectable, Logger } from '@nestjs/common';
import type {
  MpPaymentsSearchGateway,
  MpPaymentsSearchInput,
  MpPaymentsSearchResult,
} from '../domain/mp-payments-search.gateway';
import type { MpPayment } from '../domain/mp-payment';

const DEFAULT_CAP = 500;
const PAGE_LIMIT = 30;
const SEARCH_URL = 'https://api.mercadopago.com/v1/payments/search';

@Injectable()
export class HttpMpPaymentsSearchGateway implements MpPaymentsSearchGateway {
  private readonly log = new Logger(HttpMpPaymentsSearchGateway.name);

  async search(input: MpPaymentsSearchInput): Promise<MpPaymentsSearchResult> {
    const cap = input.maxResults ?? DEFAULT_CAP;
    const results: MpPayment[] = [];
    let offset = 0;
    let totalReported = 0;

    while (results.length < cap) {
      const params = new URLSearchParams({
        begin_date: input.beginDate.toISOString(),
        end_date: input.endDate.toISOString(),
        sort: 'date_created',
        criteria: 'desc',
        limit: String(PAGE_LIMIT),
        offset: String(offset),
      });
      const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
        headers: { authorization: `Bearer ${input.accessToken}` },
      });
      if (!res.ok) {
        const body = await res.text();
        this.log.warn(`MP search HTTP ${res.status}: ${body.slice(0, 300)}`);
        throw new Error(`MP /v1/payments/search HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        paging: { total: number; limit: number; offset: number };
        results: MpPayment[];
      };
      totalReported = json.paging.total;
      results.push(...json.results);
      if (json.results.length < PAGE_LIMIT) break;
      offset += PAGE_LIMIT;
    }

    const truncated = results.length >= cap;
    return {
      results: truncated ? results.slice(0, cap) : results,
      truncated,
      totalReported,
    };
  }
}
