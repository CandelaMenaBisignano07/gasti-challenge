import type { PendingPrompt } from '@/proactive/domain/pending-prompt';
import type { ProactiveRepository, ResolveInput } from '@/proactive/domain/proactive-repository';

type Deps = {
  repo: ProactiveRepository;
};

export function makeResolvePrompt({ repo }: Deps) {
  return function resolvePrompt(id: string, input: ResolveInput): Promise<PendingPrompt> {
    return repo.resolve(id, input);
  };
}
