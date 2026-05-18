/** Inbound Mercado Pago webhook notification body (spec §4). */
export interface MpWebhookDto {
  readonly type: string;
  readonly action?: string;
  readonly data: { readonly id: string };
  readonly user_id?: number | string;
  readonly live_mode?: boolean;
}
