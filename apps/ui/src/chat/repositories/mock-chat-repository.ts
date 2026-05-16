import type { ChatRepository, ReplyEvent } from '@/chat/domain/chat-repository';
import type { Conversation } from '@/chat/domain/conversation';
import type { GastiMessage, Locale, Message, ToolCall } from '@/chat/domain/message';
import { MOCK_COMIDA_BUDGET, MOCK_TRANSACTIONS } from '@/chat/repositories/mock-data';

const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/(borr[aá]|delete).*?([uú]ltim|last)/.test(t)) return 'deleteConfirm';
  if (/com[ií]da/.test(t) && /(este\s+mes|this\s+month)/.test(t)) return 'sumComidaMonth';
  if (/(food).*?(this\s+month|month)/.test(t)) return 'sumComidaMonth';
  if (/(gast[eé]\s+m[aá]s|spent\s+most|where.*?most).*?(semana|week)/.test(t)) return 'topThisWeek';
  if (/(proyect[aá]|project).*?(mes|month)/.test(t)) return 'projectMonthEnd';
  if (/(c[oó]mo\s+voy|how\s+am\s+i\s+doing).*?(com[ií]da|food)/.test(t)) return 'budgetComida';
  return 'unknown';
}

type Intent =
  | 'sumComidaMonth'
  | 'topThisWeek'
  | 'projectMonthEnd'
  | 'budgetComida'
  | 'deleteConfirm'
  | 'unknown';

function gastiMessage(locale: Locale, text: string, opts: Partial<GastiMessage> = {}): GastiMessage {
  return {
    id: makeId(),
    role: 'gasti',
    locale,
    text,
    sentAt: new Date().toISOString(),
    ...opts,
  };
}

function toolCall(name: string, inputs: Record<string, unknown>): ToolCall {
  return { id: makeId(), name, inputs };
}

export class MockChatRepository implements ChatRepository {
  async loadInitial(): Promise<Conversation> {
    return { id: 'conv-1', messages: [], startedAt: new Date().toISOString() };
  }

  async *reply(input: { text: string; locale: Locale; history: Message[] }): AsyncIterable<ReplyEvent> {
    const intent = detectIntent(input.text);
    const { locale } = input;

    if (intent === 'deleteConfirm') {
      yield {
        kind: 'final',
        message: gastiMessage(
          locale,
          locale === 'es'
            ? '¿Querés borrar Rappi — $4.500 del 8 may?'
            : 'Do you want to delete Rappi — $4,500 from May 8?',
          {
            attachments: [
              {
                kind: 'optionPills',
                options: [
                  { id: 'confirm', label: locale === 'es' ? 'Sí, borralo' : 'Yes, delete', intent: 'confirm' },
                  { id: 'cancel', label: locale === 'es' ? 'Cancelar' : 'Cancel', intent: 'cancel' },
                ],
              },
            ],
          },
        ),
      };
      return;
    }

    yield { kind: 'thinking' };
    await delay(420);

    switch (intent) {
      case 'sumComidaMonth': {
        const call = toolCall('sumSpendByCategory', { category: 'comida', period: 'currentMonth' });
        yield { kind: 'toolCall', call };
        await delay(380);
        const comida = MOCK_TRANSACTIONS.filter(
          (t) => t.category === 'comida' && t.date.startsWith('2026-05'),
        );
        const total = comida.reduce((a, t) => a + t.amount, 0);
        yield {
          kind: 'final',
          message: gastiMessage(
            locale,
            locale === 'es'
              ? `Gastaste $${Math.abs(total).toLocaleString('es-AR')} en comida este mes.`
              : `You spent $${Math.abs(total).toLocaleString('es-AR')} on food this month.`,
            {
              toolCalls: [call],
              attachments: [{ kind: 'transactionList', items: comida }],
            },
          ),
        };
        return;
      }

      case 'topThisWeek': {
        const call = toolCall('topCategoriesInRange', { from: '2026-05-02', to: '2026-05-08' });
        yield { kind: 'toolCall', call };
        await delay(360);
        yield {
          kind: 'final',
          message: gastiMessage(
            locale,
            locale === 'es'
              ? 'Esta semana lo más fuerte fue salud ($83.900), seguido por comida ($54.000) y otros ($45.000).'
              : 'This week the biggest line was health ($83,900), then food ($54,000) and other ($45,000).',
            { toolCalls: [call] },
          ),
        };
        return;
      }

      case 'projectMonthEnd': {
        const call = toolCall('projectMonthEnd', { asOf: new Date().toISOString().slice(0, 10) });
        yield { kind: 'toolCall', call };
        await delay(500);
        yield {
          kind: 'final',
          message: gastiMessage(
            locale,
            locale === 'es'
              ? 'Vas $499.698 en gastos este mes. A este ritmo el mes cierra cerca de $620.000. El número es estimativo — el alquiler y la prepaga ya pesaron al principio.'
              : 'You’re at $499,698 in expenses this month. At this pace the month closes around $620,000. The number is rough — rent and health insurance already landed early on.',
            { toolCalls: [call] },
          ),
        };
        return;
      }

      case 'budgetComida': {
        const call = toolCall('getBudgetProgress', { category: 'comida' });
        yield { kind: 'toolCall', call };
        await delay(380);
        yield {
          kind: 'final',
          message: gastiMessage(
            locale,
            locale === 'es'
              ? 'Vas $54.000 de $80.000 en comida. Al ritmo actual proyectás $92.000 — vas a pasar el presupuesto por $12.000.'
              : 'You’re at $54,000 of $80,000 on food. At this pace you’d hit $92,000 — over budget by $12,000.',
            {
              toolCalls: [call],
              attachments: [
                {
                  kind: 'budgetProgress',
                  progress: MOCK_COMIDA_BUDGET,
                  captionEs:
                    locale === 'es'
                      ? 'Proyectado: $92.000 a fin de mes'
                      : 'Projected: $92,000 by month end',
                },
              ],
            },
          ),
        };
        return;
      }

      default: {
        yield {
          kind: 'final',
          message: gastiMessage(
            locale,
            locale === 'es'
              ? 'No entendí esa. Probá con: "¿cuánto gasté en comida este mes?" o "¿cómo voy con comida?".'
              : 'I didn’t catch that. Try: "how much did I spend on food this month?" or "how am I doing on food?".',
          ),
        };
      }
    }
  }

  async *confirmOption(input: { optionId: string; history: Message[] }): AsyncIterable<ReplyEvent> {
    // Detect the locale from the last user message
    const lastUser = [...input.history].reverse().find((m) => m.role === 'user');
    const locale: Locale = lastUser?.locale ?? 'es';
    await delay(220);
    if (input.optionId === 'confirm') {
      yield { kind: 'final', message: gastiMessage(locale, locale === 'es' ? 'Listo. Borrada.' : 'Done. Deleted.') };
    } else {
      yield { kind: 'final', message: gastiMessage(locale, locale === 'es' ? 'Cancelado.' : 'Cancelled.') };
    }
  }
}
