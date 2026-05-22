/**
 * Eval the classify-transaction workflow against a hand-curated fixture.
 *
 * Usage:
 *   1. Start apps/ai:   cd apps/ai && bun dev   (requires OPENAI_API_KEY)
 *   2. Start apps/api:  cd apps/api && bun dev
 *   3. Run:             bun run scripts/eval-classifier.ts
 *
 * Output: per-entry pass/fail line + summary (accuracy, avg confidence, low-conf count).
 * Not part of CI — the LLM is non-deterministic.
 */
import fixture from '../data/eval/classifier-fixture.json' assert { type: 'json' };

const API = process.env.API_BASE_URL ?? 'http://localhost:3001';
const AI = process.env.AI_BASE_URL ?? 'http://localhost:4111';

interface FixtureEntry {
  merchant: string;
  description: string | null;
  amount: number;
  expected: string;
}

interface ClassifyResult {
  category: string;
  confidence: number;
  reasoning?: string;
}

async function fetchCategories(): Promise<Array<{ name: string; description: string }>> {
  const res = await fetch(`${API}/categorization/list-categories`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`list-categories ${res.status}`);
  const { categories } = (await res.json()) as {
    categories: Array<{ name: string; isCustom: boolean; description: string }>;
  };
  return categories.map(({ name, description }) => ({ name, description }));
}

async function classify(
  entry: FixtureEntry,
  categories: Array<{ name: string; description: string }>,
): Promise<ClassifyResult> {
  const res = await fetch(`${AI}/api/workflows/classify-transaction/start-async`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      inputData: {
        merchant: entry.merchant,
        description: entry.description,
        amount: entry.amount,
        direction: 'expense',
        categories,
      },
    }),
  });
  const json = (await res.json()) as { status?: string; result?: ClassifyResult };
  if (json.status !== 'success' || !json.result) throw new Error(`workflow ${json.status}`);
  return json.result;
}

async function main() {
  const categories = await fetchCategories();
  const entries = fixture as FixtureEntry[];
  let hits = 0;
  let lowConfidence = 0;
  let totalConfidence = 0;
  const wrong: Array<{ entry: FixtureEntry; got: string; conf: number }> = [];

  for (const entry of entries) {
    const r = await classify(entry, categories);
    const hit = r.category === entry.expected;
    if (hit) hits++;
    else wrong.push({ entry, got: r.category, conf: r.confidence });
    if (r.confidence < 0.4) lowConfidence++;
    totalConfidence += r.confidence;
    const mark = hit ? '✓' : '✗';
    const m = entry.merchant.padEnd(24);
    const e = entry.expected.padEnd(16);
    const g = r.category.padEnd(16);
    console.log(`${mark} ${m} expected=${e} got=${g} conf=${r.confidence.toFixed(2)}`);
  }

  console.log('\n--- Summary ---');
  console.log(`Accuracy:        ${hits}/${entries.length} (${((hits / entries.length) * 100).toFixed(1)}%)`);
  console.log(`Avg confidence:  ${(totalConfidence / entries.length).toFixed(3)}`);
  console.log(`Low conf (<0.4): ${lowConfidence}`);
  if (wrong.length > 0) {
    console.log('\nWrong:');
    for (const w of wrong) {
      console.log(`  ${w.entry.merchant} → expected ${w.entry.expected}, got ${w.got} (${w.conf.toFixed(2)})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
