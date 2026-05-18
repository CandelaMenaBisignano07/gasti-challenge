import { MastraClient } from '@mastra/client-js';
import { createReplyEventMapper, type MastraChunk } from '@/chat/providers/mastra-stream-mapper';
import type { ReplyEvent } from '@/chat/domain/chat-repository';
import { mapHistoryToMessages, type PersistedMessage } from '@/chat/providers/history-message-mapper';

export const runtime = 'nodejs';

const MASTRA_BASE_URL = process.env.MASTRA_BASE_URL ?? 'http://localhost:4112';

type ChatRequest = { text: string; threadId: string; resourceId: string };

function errorFinal(): ReplyEvent {
  return {
    kind: 'final',
    message: {
      id: crypto.randomUUID(),
      role: 'gasti',
      text: 'No pude conectarme con Gasti en este momento. Probá de nuevo en un rato.',
      sentAt: new Date().toISOString(),
    },
  };
}

export async function POST(req: Request): Promise<Response> {
  const { text, threadId, resourceId } = (await req.json()) as ChatRequest;
  const encoder = new TextEncoder();
  const mapper = createReplyEventMapper(() => crypto.randomUUID(), () => new Date());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ReplyEvent) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const client = new MastraClient({ baseUrl: MASTRA_BASE_URL });
        const agent = client.getAgent('gasti');
        const response = await agent.stream(text, {
          memory: { thread: threadId, resource: resourceId },
        });
        await response.processDataStream({
          // processDataStream types onChunk as returning Promise<void>; async satisfies it.
          onChunk: async (chunk: MastraChunk) => {
            for (const event of mapper.onChunk(chunk)) emit(event);
          },
        });
        for (const event of mapper.end()) emit(event);
      } catch {
        emit(errorFinal());
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}

/**
 * Restores a persisted thread. Returns the agent's stored conversation mapped to
 * the UI's rich `Message[]` shape. Never throws to the client — a missing thread
 * or any failure yields an empty conversation.
 *
 * Looked up by `threadId` alone: thread ids are globally unique, so `resourceId`
 * is not needed to identify the thread (it scopes access, not identity, and this
 * is a single-user app). `listMessages()` returns its default first page — very
 * long threads beyond that page are not yet restored (see spec "Out of scope").
 */
export async function GET(req: Request): Promise<Response> {
  const threadId = new URL(req.url).searchParams.get('threadId') ?? '';
  if (!threadId) return Response.json({ messages: [] });

  try {
    const client = new MastraClient({ baseUrl: MASTRA_BASE_URL });
    const thread = client.getMemoryThread({ threadId, agentId: 'gasti' });
    const result = await thread.listMessages();
    const persisted = (result?.messages ?? []) as PersistedMessage[];
    return Response.json({ messages: mapHistoryToMessages(persisted) });
  } catch {
    return Response.json({ messages: [] });
  }
}
