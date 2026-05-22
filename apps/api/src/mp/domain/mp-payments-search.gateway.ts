import type { MpPayment } from './mp-payment';

export const MP_PAYMENTS_SEARCH_GATEWAY = 'MP_PAYMENTS_SEARCH_GATEWAY';

export interface MpPaymentsSearchInput {
  readonly accessToken: string;
  readonly beginDate: Date;
  readonly endDate: Date;
  /** Hard cap on total results across pagination. Default applied by impl. */
  readonly maxResults?: number;
}

export interface MpPaymentsSearchResult {
  readonly results: readonly MpPayment[];
  readonly truncated: boolean;
  readonly totalReported: number;
}

export interface MpPaymentsSearchGateway {
  search(input: MpPaymentsSearchInput): Promise<MpPaymentsSearchResult>;
}
