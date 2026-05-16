import type { ChatRepository, ReplyEvent } from '@/chat/domain/chat-repository';
import type { Conversation } from '@/chat/domain/conversation';
import type { GastiMessage, Message, ToolCall } from '@/chat/domain/message';
import { MOCK_COMIDA_BUDGET, MOCK_TRANSACTIONS } from '@/chat/repositories/mock-data';

const delay = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type Intent =
  | 'sumComidaMonth'
  | 'topThisWeek'
  | 'projectMonthEnd'
  | 'budgetComida'
  | 'deleteConfirm'
  | 'unknown';

function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/borr[aá].*?[uú]ltim/.test(t)) return 'deleteConfirm';
  if (/com[ií]da/.test(t) && /este\s+mes/.test(t)) return 'sumComidaMonth';
  if (/gast[eé]\s+m[aá]s.*?semana/.test(t)) return 'topThisWeek';
  if (/proyect[aá].*?mes/.test(t)) return 'projectMonthEnd';
  if (/c[oó]mo\s+voy.*?com[ií]da/.test(t)) return 'budgetComida';
  return 'unknown';
}

function gastiMessage(text: string, opts: Partial<GastiMessage> = {}): GastiMessage {
  return {
    id: makeId(),
    role: 'gasti',
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

  async *reply(input: { text: string; history: Message[] }): AsyncIterable<ReplyEvent> {
    const intent = detectIntent(input.text);

    if (intent === 'deleteConfirm') {
      yield {
        kind: 'final',
        message: gastiMessage('¿Querés borrar Rappi — $4.500 del 8 may?', {
          attachments: [
            {
              kind: 'optionPills',
              options: [
                { id: 'confirm', label: 'Sí, borralo', intent: 'confirm' },
                { id: 'cancel', label: 'Cancelar', intent: 'cancel' },
              ],
            },
          ],
        }),
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
            `Gastaste $${Math.abs(total).toLocaleString('es-AR')} en comida este mes.`,
            {
              toolCalls: [call],
              attachments: [{ kind: 'transactionList', items: comida }],
            },
          ),
        };
        return;
      }

      case 'topThisWeek': {
        // Scripted figures verified against MOCK_TRANSACTIONS for the 2026-05-02..05-08 window:
        // salud $83.900 (txn_013 + txn_006), comida $54.000 (txn_001/003/005/009), otros $45.000 (txn_007).
        const call = toolCall('topCategoriesInRange', { from: '2026-05-02', to: '2026-05-08' });
        yield { kind: 'toolCall', call };
        await delay(360);
        yield {
          kind: 'final',
          message: gastiMessage(
            'Esta semana lo más fuerte fue salud ($83.900), seguido por comida ($54.000) y otros ($45.000).',
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
            'Vas $499.698 en gastos este mes. A este ritmo el mes cierra cerca de $620.000. El número es estimativo — el alquiler y la prepaga ya pesaron al principio.',
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
            'Vas $54.000 de $80.000 en comida. Al ritmo actual proyectás $92.000 — vas a pasar el presupuesto por $12.000.',
            {
              toolCalls: [call],
              attachments: [
                {
                  kind: 'budgetProgress',
                  progress: MOCK_COMIDA_BUDGET,
                  caption: 'Proyectado: $92.000 a fin de mes',
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
            'No entendí esa. Probá con: "¿cuánto gasté en comida este mes?" o "¿cómo voy con comida?".',
          ),
        };
      }
    }
  }

  async *confirmOption(input: { optionId: string; history: Message[] }): AsyncIterable<ReplyEvent> {
    await delay(220);
    if (input.optionId === 'confirm') {
      yield { kind: 'final', message: gastiMessage('Listo. Borrada.') };
    } else {
      yield { kind: 'final', message: gastiMessage('Cancelado.') };
    }
  }
}
