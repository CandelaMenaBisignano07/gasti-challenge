import { MastraClient } from '@mastra/client-js';
import { createReplyEventMapper, type MastraChunk } from '@/chat/providers/mastra-stream-mapper';
import type { ReplyEvent } from '@/chat/domain/chat-repository';

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
