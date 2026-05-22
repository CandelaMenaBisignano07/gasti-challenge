# Design — Tags con descripción semántica para el clasificador

**Date:** 2026-05-22
**Status:** approved
**Author:** brainstorming session (Claude + user)

---

## 1. Problem & goal

Hoy `apps/api/src/shared/domain/category.ts` define las 7 categorías como `string[]`. El agente conversacional (`apps/ai/src/agent/instructions.ts`) las interpola como lista plana de nombres en el system prompt. Cuando `AddTransaction` no recibe categoría y no hay merchant override, cae a `'otros'`. No hay clasificador LLM en `main`; la rama `worktree-proactive-mercadopago` tiene un classifier MP-específico cuyo prompt **también** lista categorías hardcoded sin descripción ("comida: groceries, restaurants, delivery, cafés"), exactamente el problema que esta feature ataca.

**Goal:** que cada categoría guarde un texto descriptivo editable que define qué tipo de gasto cae ahí. El clasificador (y el agente) consumen ese texto como fuente única de verdad. El criterio de éxito del brief:

1. El clasificador, ante el mismo input, produce categorías más consistentes que antes (medible con un set de prueba de 20–30 pagos).
2. Confianza promedio sube (menos items en zona `<0.4`).
3. La descripción de cada categoría es la única fuente de verdad — sin reglas hardcoded duplicadas.
4. Un usuario puede ver y modificar la descripción sin tocar código, y la siguiente clasificación refleja el cambio.

## 2. Brainstorming decisions

| Decisión | Elegido | Notas |
|---|---|---|
| Scope v1 | **Editables desde día uno** | Descripción persistida en JSON file. UI mínima + tools conversacionales. |
| Granularidad | Per-user (único usuario) | No-question por PRODUCT.md (single user). |
| Set expandible | Sí, ya lo es | `CreateCategory` ya existe. Se extiende para aceptar `description` opcional. |
| UX placement | **Settings page + conversacional** | Nueva ruta `/settings/categories` + tools de Mastra. |
| Defaults seed | **Seed descriptions en domain, editables** | Las 7 defaults arrancan con descripciones razonables hardcoded en `DEFAULT_CATEGORIES`. El override del usuario persiste en `data/default-category-overrides.json`. Reset disponible. |
| Consumidor v1 | **Cherry-pick clasificador MP + generalize** | Bajamos el clasificador de `worktree-proactive-mercadopago`, lo generalizamos (sin MP-isms) y lo enchufamos en `AddTransaction`. Cuando MP merge, su `HttpPaymentClassifier` se reemplaza por nuestro `HttpTransactionClassifier`. |

**Nota sobre el brief:** el brief escrito dice "No coordinar con MP". La instrucción en vivo de la sesión de brainstorming pidió cherry-pickear el classifier de MP. Sigo la instrucción en vivo (autoridad mayor) — el clasificador se trae a este branch y se generaliza. La rama MP, cuando se rebase, va a tener que mapear sus inputs (`counterparty → merchant`, `kind → direction`) al contrato generalizado.

## 3. Architecture

Tres apps tocadas: `apps/api` (domain + use-cases + classifier HTTP client), `apps/ai` (Mastra workflow + agent prompt), `apps/ui` (settings page + header nav).

Flujo de clasificación de una transacción nueva sin categoría explícita:

```
UI / agent
   │ addTransaction({ merchant, amount, description })
   ▼
apps/api: AddTransaction.execute()
   │   1. ¿hay merchant override? → usarlo, source='override'
   │   2. ¿no? → HttpTransactionClassifier.classify(...)
   │              │ payload: { merchant, amount, description, direction, categories: [{name, description}, ...] }
   │              │ source: CategoryDescriptionResolver.resolveAll()
   │              ▼
   │            apps/ai: POST /api/workflows/classify-transaction/start-async
   │              │ step build-prompt: arma prompt con la lista de descripciones
   │              │ step classify (structuredOutput): transactionClassifierAgent → { category, confidence, reasoning? }
   │              ▼
   │   3. respuesta → category + confidence, source='classifier'
   │      retry 1× a 500ms, fallback {category:'otros', confidence:0, source:'fallback'}
   ▼
Persiste Transaction con classificationConfidence + classificationSource
```

Flujo de edición de descripción:

```
UI settings page → POST /categorization/update-description
                                       │
                                       ▼
                             UpdateCategoryDescription.execute()
                                       │
                            ┌──────────┴──────────┐
                            ▼                     ▼
                  default → DefaultCategoryOverridesRepository.set()
                  custom  → CategoriesRepository.setDescription()
```

Agente conversacional vía `updateCategoryDescription` tool: mismo path, distinto entry point.

## 4. Domain shape

### `apps/api/src/shared/domain/category.ts`

```ts
import { z } from 'zod';

export interface CategoryDefinition {
  readonly name: string;
  readonly description: string;
}

export const DEFAULT_CATEGORIES: readonly CategoryDefinition[] = [
  { name: 'comida',          description: 'Restaurantes, delivery, supermercados, almacenes, kioscos, cafés.' },
  { name: 'transporte',      description: 'Uber, Cabify, taxi, colectivo, subte, SUBE, combustible, peajes, estacionamiento.' },
  { name: 'entretenimiento', description: 'Streaming (Netflix, Spotify), juegos, cine, bares, salidas, eventos.' },
  { name: 'salud',           description: 'Farmacia, médicos, obra social, prepaga, gimnasio, terapia.' },
  { name: 'servicios',       description: 'Luz, gas, agua, internet, telefonía, expensas, suscripciones funcionales (Drive, iCloud).' },
  { name: 'educacion',       description: 'Cursos, colegiatura, universidad, libros, capacitaciones, idiomas.' },
  { name: 'otros',           description: 'Catch-all explícito cuando el usuario lo elige. Nunca es una caída silenciosa.' },
];

export const DEFAULT_CATEGORY_NAMES: readonly string[] =
  DEFAULT_CATEGORIES.map((c) => c.name);

/** Schema externo: sigue siendo solo el nombre. Las descripciones no son payload. */
export const categorySchema = z.string().min(1);
export type Category = z.infer<typeof categorySchema>;

export const DISCRETIONARY_CATEGORIES: readonly string[] = ['entretenimiento', 'otros'];
export function isDiscretionary(category: string): boolean {
  return DISCRETIONARY_CATEGORIES.includes(category);
}
```

### `apps/api/src/shared/domain/custom-categories.ts`

```ts
export const CATEGORIES_REPOSITORY = 'CATEGORIES_REPOSITORY';

export interface CustomCategoryDefinition {
  readonly name: string;
  readonly description: string;
}
export type CustomCategories = CustomCategoryDefinition[];
export const EMPTY_CUSTOM_CATEGORIES: CustomCategories = [];

export interface CategoriesRepository {
  all(): Promise<CustomCategories>;
  add(name: string, description: string): Promise<void>;
  remove(name: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;  // preserva description
  setDescription(name: string, description: string): Promise<void>;
}
```

### `apps/api/src/shared/domain/default-category-overrides.ts` (nuevo)

```ts
export const DEFAULT_CATEGORY_OVERRIDES_REPOSITORY = 'DEFAULT_CATEGORY_OVERRIDES_REPOSITORY';

/** Solo descripciones — los nombres de las 7 defaults son inmutables. */
export type DefaultCategoryOverrides = Record<string, string>;

export interface DefaultCategoryOverridesRepository {
  all(): Promise<DefaultCategoryOverrides>;
  set(name: string, description: string): Promise<void>;
  reset(name: string): Promise<void>;
}
```

### `apps/api/src/shared/providers/category-description-resolver.ts` (nuevo)

```ts
@Injectable()
export class CategoryDescriptionResolver {
  constructor(
    @Inject(CATEGORIES_REPOSITORY) private readonly customs: CategoriesRepository,
    @Inject(DEFAULT_CATEGORY_OVERRIDES_REPOSITORY) private readonly defaults: DefaultCategoryOverridesRepository,
    private readonly registry: CategoryRegistry,
  ) {}

  /** Override del usuario > seed > descripción de la custom > ''. Throw si name no existe. */
  async resolve(name: string): Promise<string> {
    if (!(await this.registry.exists(name))) throw new DomainError('NOT_FOUND', `La categoría "${name}" no existe.`);
    if (this.registry.isDefault(name)) {
      const overrides = await this.defaults.all();
      if (name in overrides) return overrides[name];
      return DEFAULT_CATEGORIES.find((c) => c.name === name)!.description;
    }
    const all = await this.customs.all();
    return all.find((c) => c.name === name)?.description ?? '';
  }

  /** Defaults primero (con override aplicado), luego customs. Una sola lectura por repo. */
  async resolveAll(): Promise<Array<{ name: string; description: string; isCustom: boolean }>> {
    const overrides = await this.defaults.all();
    const customs = await this.customs.all();
    const defaults = DEFAULT_CATEGORIES.map((c) => ({
      name: c.name,
      description: overrides[c.name] ?? c.description,
      isCustom: false,
    }));
    const customList = customs.map((c) => ({ name: c.name, description: c.description, isCustom: true }));
    return [...defaults, ...customList];
  }
}
```

### `apps/api/src/shared/domain/transaction.ts`

Agregar dos campos opcionales:

```ts
classificationConfidence?: number;  // 0..1, presente solo si vino del classifier
classificationSource?: 'manual' | 'override' | 'classifier' | 'fallback';
```

Filas viejas en `data/transactions.json` siguen siendo válidas (campos opcionales).

### `apps/ai/src/shared/domain/category.ts` — mirror del de apps/api

**Importante:** `apps/ai` tiene su propio `shared/domain/category.ts` (no comparte código con `apps/api` — son apps independientes en el monorepo). Hay que hacer el **mismo** cambio de shape ahí: `DEFAULT_CATEGORIES` pasa de `readonly string[]` a `readonly CategoryDefinition[]` con las mismas seeds. `categorySchema` se mantiene como `z.string().min(1)`.

El consumidor del lado ai (`apps/ai/src/mastra/index.ts:55` en el fallback `requestContext.set('categories', [...DEFAULT_CATEGORIES])`) hoy itera asumiendo strings; pasa a iterar `CategoryDefinition` con `.name`/`.description`.

## 5. Persistence & migration

| Archivo | Formato viejo | Formato nuevo |
|---|---|---|
| `data/custom-categories.json` | `["bocata", "regalos"]` | `[{"name":"bocata","description":"..."}]` |
| `data/default-category-overrides.json` | (no existía) | `{"comida":"override del usuario..."}` (solo entries que difieren de la seed) |
| `data/transactions.json` | sin `classificationConfidence` ni `classificationSource` | mismos campos opcionales agregados a filas nuevas; filas viejas inalteradas |

**Migración lazy** en `JsonCategoriesRepository`:

```ts
private normalize(raw: unknown[]): CustomCategories {
  return raw.map((entry) => {
    if (typeof entry === 'string') return { name: entry, description: '' };
    const e = entry as { name: string; description?: string };
    return { name: e.name, description: e.description ?? '' };
  });
}
```

Sin script de migración, sin paso manual. Idempotente, tolerante a mezcla.

## 6. Classifier — cherry-pick + generalize

### Mecánica

No `git cherry-pick <sha>` (los commits arrastran código MP irrelevante). En su lugar:

```bash
git checkout worktree-proactive-mercadopago -- \
  apps/ai/src/mp-classification/agents/mp-classifier.agent.ts \
  apps/ai/src/mp-classification/workflows/classify-mp-event.workflow.ts \
  apps/ai/src/mp-classification/domain/classification.ts \
  apps/api/src/mp/domain/payment-classifier.ts \
  apps/api/src/mp/domain/classification.ts \
  apps/api/src/mp/providers/http-payment-classifier.ts
# Luego: renombrar + adaptar a mano.
```

### Layout final en `apps/ai`

```
apps/ai/src/categorization/
├── agents/
│   └── transaction-classifier.agent.ts
├── domain/
│   ├── categorization.gateway.ts          # existente, se extiende
│   └── classification.ts                  # nuevo
└── workflows/
    └── classify-transaction.workflow.ts
```

### `classification.ts` (sin MP-isms)

```ts
export const classifyTransactionInput = z.object({
  merchant: z.string().min(1),
  description: z.string().nullable(),
  amount: z.number().positive(),
  direction: z.enum(['expense', 'income']).default('expense'),
  categories: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })).min(1),
});

export const classificationResult = z.object({
  category: categorySchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(160).optional(),
});
```

**Sobre `reasoning`:** opcional, máximo 160 chars en español. En v1 **no se persiste** en `Transaction` ni se renderiza en la UI; el `HttpTransactionClassifier` lo logea a `Logger.debug` cuando viene presente (para inspeccionar decisiones en dev). Lo mantenemos en el schema para que el agent pueda producirlo y para abrir la puerta a una v2 que lo muestre en una disclosure de la transacción.

### Agent (instrucciones)

Sin lista de categorías hardcoded. El prompt instruye al modelo a usar **exclusivamente** las descripciones que vienen en el inputData. Si nada matchea → `'otros'` con bajo confidence (no inventa categoría inexistente).

### Workflow

Dos steps: `build-classification-prompt` (arma el prompt incluyendo `CATEGORIES (use these descriptions as the source of truth):` seguido de cada `- name: description`) y `classify` con `structuredOutput` validando contra `classificationResult`.

Registrado en `apps/ai/src/mastra/index.ts` como `classifyTransaction`. Mastra lo expone en `POST /api/workflows/classify-transaction/start-async`.

### Cliente HTTP — `apps/api/src/categorization/providers/http-transaction-classifier.ts`

Implementa `TransactionClassifier` (token `TRANSACTION_CLASSIFIER` en `apps/api/src/categorization/domain/transaction-classifier.ts`). Antes de cada call, lee la lista actual vía `CategoryDescriptionResolver.resolveAll()` y la pasa como `inputData.categories`.

Retry 1× a 500ms, fallback a `{ category: 'otros', confidence: 0 }`. Defensa extra: si el LLM devuelve un `category` que no está en `registry.all()`, swap a `'otros'` con `confidence: 0` y log warning.

Sin timeout custom — default de `fetch`. La UI muestra "Buscando..." mientras tanto. Aceptable para v1.

## 7. Use-cases, tools, agent prompt

### Nuevos use-cases en `apps/api/src/categorization/use-cases/`

- **`UpdateCategoryDescription`** — `{ name, description }` → valida `exists`, valida longitud `<= 240`, normaliza nombre, trim descripción. Ramifica: default → `defaults.set()`, custom → `customs.setDescription()`.
- **`ResetCategoryDescription`** — `{ name }` → solo defaults. Custom devuelve `VALIDATION_ERROR` ("Solo las categorías default pueden volver al texto original — para limpiar una custom usá updateCategoryDescription con descripción vacía.").

### Extensiones

- **`CreateCategory`** acepta `description?: string` (default `''`, max 240).
- **`ListCategories`** devuelve `{ name, isCustom, description }` por entry.
- **`DeleteCategory`** sin cambios — la descripción vive dentro del record, `repo.remove(name)` la borra junto con la entrada.
- **`RenameCategory`** sin cambios de lógica. El método `JsonCategoriesRepository.rename` preserva la descripción al mapear entries (`c.name === from ? { name: to, description: c.description } : c`).
- **`ProposeCategoryChange`** sin cambios. Las descripciones no requieren propose — son no destructivas.

### Endpoints HTTP nuevos

```
POST /categorization/update-description  body: { name, description }
POST /categorization/reset-description    body: { name }
```

`list-categories` (existente) gana el campo `description` en el output — change additive.

### Tools de Mastra

`apps/ai/src/categorization/interface/categorization.tools.ts` gana:

- **`updateCategoryDescription`** — Non-destructive, sin confirmation. Tool description: "Set or update the semantic description of a category — the text the classifier uses to decide what fits. Use when the user says things like 'comida es solo restaurantes, no super'. Empty description is allowed (clears it)."
- **`resetCategoryDescription`** — Solo defaults. Custom devuelve error.

### Cambios en el agente

`apps/ai/src/agent/gasti-agent.ts` extiende `requestContextSchema` reemplazando `categories: z.array(z.string())` por `categoriesWithDescriptions: z.array(z.object({ name: z.string(), description: z.string() }))`. El caller que arma el `requestContext` es el middleware Hono en `apps/ai/src/mastra/index.ts` (líneas ~48–56). Hoy hace:

```ts
const { categories } = await categorizationGateway.list({}, { userId: 'default-user' });
requestContext.set('categories', categories.map((c) => c.name));
```

Pasa a:

```ts
const { categories } = await categorizationGateway.list({}, { userId: 'default-user' });
requestContext.set('categoriesWithDescriptions', categories.map((c) => ({ name: c.name, description: c.description })));
```

Fallback (catch branch): `requestContext.set('categoriesWithDescriptions', DEFAULT_CATEGORIES.map((c) => ({ name: c.name, description: c.description })))`.

`apps/ai/src/agent/instructions.ts` — el bloque `CATEGORIES` cambia:

```diff
-- The user's spending categories right now are: ${categoryList}. This set is dynamic — the user can create their own.
+- The user's spending categories right now are, with the user's own description of what each one includes:
+${categoriesBlock}
+  Where a description is shown, treat it as the user's source of truth for what belongs in that category — it overrides any common-sense intuition you have.
+  Where a description is empty (just a name), fall back to your best general understanding of the category, but if a transaction is genuinely ambiguous, surface that ambiguity instead of guessing.
```

Dos reglas nuevas en `MUTATIONS`:

- "If the user describes what a category means or should include ('comida es solo restaurantes, no super'), call updateCategoryDescription. Do not just acknowledge the preference in chat — persist it through the tool."
- "To wipe a description on a DEFAULT and go back to the seed, call resetCategoryDescription. Custom categories cannot be 'reset' — use updateCategoryDescription with an empty string to clear them."

### `AddTransaction` branch nuevo

```ts
if (input.category) {
  category = input.category;
  classificationSource = 'manual';
} else {
  const override = await this.categories.categoryForMerchant(input.merchant);
  if (override) {
    category = override;
    classificationSource = 'override';
  } else {
    const result = await this.classifier.classify({
      merchant: input.merchant,
      description: input.description,
      amount: input.amount,
      direction: 'expense',
    });
    category = result.category;
    classificationConfidence = result.confidence;
    classificationSource = result.confidence > 0 ? 'classifier' : 'fallback';
  }
}
```

`TRANSACTION_CLASSIFIER` token bound en `TransactionsModule` a `HttpTransactionClassifier`. Para tests: `FakeTransactionClassifier` configurable, inyectado vía `TestingModule` override (patrón de `clock.ts`).

## 8. UI — settings page + header nav

### Header global (`apps/ui/src/shared/ui/app-header.tsx`)

Componente nuevo, ~56px alto, sticky top. Wordmark **Gasti** a la izquierda (click → reset chat a landing, comportamiento ya existente extraído a handler compartido). Botón ghost `⚙ Configuración` a la derecha → `/settings/categories`. Sobre `--surface-1` en working screens, sobre frosted strip cuando el chat está en landing. Wire en `apps/ui/app/layout.tsx`.

### Ruta `apps/ui/app/settings/categories/page.tsx`

Server component fino que monta `<CategorySettingsScreen />`. Sin index de `/settings` — única página por ahora (YAGNI).

### Feature folder `apps/ui/src/settings/`

```
settings/
├── components/
│   ├── category-settings-screen.tsx
│   ├── category-description-card.tsx
│   └── category-description-editor.tsx
├── domain/
│   └── category-with-description.ts
├── repositories/
│   └── http-categories-settings-repository.ts
└── use-cases/
    ├── load-categories-with-descriptions.ts
    ├── update-category-description.ts
    └── reset-category-description.ts
```

### `CategorySettingsScreen`

```tsx
<main className="mx-auto max-w-[720px] px-5 py-8">
  <header className="mb-6">
    <h1 className="text-display-md">Categorías</h1>
    <p className="text-body text-ink-2 mt-2">
      Describí qué incluís en cada categoría. Gasti las usa para clasificar transacciones nuevas.
    </p>
  </header>
  <ul className="space-y-3">
    {categories.map((c) => <CategoryDescriptionCard key={c.name} category={c} />)}
  </ul>
</main>
```

### `CategoryDescriptionCard` (lavender row variant, DESIGN.md)

**Read state:** icon tile 36×36 a la izquierda (Lucide glyph según mapeo de DESIGN.md), nombre `--t-title-sm` `--ink-1` + pill micro `Default`/`Custom` + ghost `Editar` a la derecha; descripción `--t-body` `--ink-2` debajo. Si vacía: editorial italic `Sin descripción.` en `--ink-4`.

**Editing state:** textarea borderless en sub-card `--surface-0` con `--r-md`, auto-grow 60–200px, focus ring 2px `--ai-violet`. Char count `--t-label-tiny` `--ink-3`, pasa a `--neg` si excede. Botones derecha-a-izquierda: `Guardar` (primary pill, único primary del card), `Cancelar` (ghost), `Volver al default` (ghost, solo visible si es default con override).

**Behavior:**
- Optimistic update; rollback + toast en error.
- `Cmd/Ctrl+Enter` guarda, `Esc` cancela.
- `Volver al default` confirma inline ("¿Volver al texto original?" con pills Sí/No — no modal nuevo).

### Repos / use-cases UI

`http-categories-settings-repository.ts` apunta a los endpoints existentes y los nuevos. Use-cases UI son adapters thin (patrón de `apps/ui/src/budgets/use-cases/`). Estado client-side: `useState` local por card; sin Redux, sin SWR (YAGNI por ahora).

### Loading / empty / error

- Loading inicial: skeleton de 7 cards lavanda, mínimo 480ms.
- Empty: no aplica (siempre las 7 defaults).
- Error de carga: card lavanda full-width "No pudimos cargar las categorías. Reintentar." + ghost `Reintentar`.
- Error de save: toast inferior (componente simple, sin librería) + rollback.

### Out of scope para UI v1

- ❌ Crear / borrar / renombrar categoría desde esta pantalla. Sigue siendo conversacional.
- ❌ Buscar / filtrar / reordenar.
- ❌ Tabs / multi-pantalla en settings.

## 9. Error handling

### Classifier (HTTP `apps/api → apps/ai`)

| Fallo | Comportamiento |
|---|---|
| `apps/ai` unreachable, timeout, 5xx | 1 reintento a 500ms. Si falla: `{ category: 'otros', confidence: 0, source: 'fallback' }`. Tx se crea igual. |
| `status: 'failed' \| 'suspended' \| 'tripwire'` | Mismo path: fallback. `Logger.warn`. |
| `success` con body que no parsea `classificationResult` | Mismo path: fallback. `Logger.warn` con el error de Zod. |
| LLM alucina un category fuera de la lista | Post-parse defensa: si `category` no está en `registry.all()`, swap a `'otros'` con `confidence: 0`, warn. |
| LLM tarda >5s | Sin timeout custom (default `fetch`). UI muestra "Buscando...". v2 si se vuelve un problema. |

### Endpoints CRUD nuevos

| Fallo | Status |
|---|---|
| Categoría no existe | 4xx `DomainError('NOT_FOUND')` |
| Descripción > 240 chars | 4xx `DomainError('VALIDATION_ERROR')` |
| Reset sobre custom | 4xx `DomainError('VALIDATION_ERROR', 'Solo las categorías default pueden volver al texto original.')` |
| Fallo IO al escribir JSON | 5xx — propaga, igual que el resto del repo |

### Observability

- `Logger` (Nest) en `HttpTransactionClassifier` para fallbacks.
- Sin métricas custom — la medición de éxito es manual via `scripts/eval-classifier.ts` (fuera de CI; LLM no determinístico → flakey).

### Memoria del agente

Las descripciones **no** viven en `workingMemory` ni `semanticRecall`. Viven en `data/*.json`. El agente las lee siempre desde el system prompt (cada turno) o vía tool call fresca. Evita desync "lo que dijo el usuario hace 3 semanas vs. lo que dice el JSON ahora".

### Concurrencia

Single-user, single-process. Sin locks adicionales. `JsonStore` ya serializa writes — verificar y agregar mutex en `json-store.ts` si no lo tiene (task incluida en el plan).

### Backwards compat HTTP

- `list-categories` output gana `description` — additive, no rompe.
- `create-category` body gana `description?` opcional — no rompe.
- Tools de Mastra nuevas — additive en el gateway.

## 10. Testing

Tests en `apps/api` con `bun:test` (patrón existente).

| Archivo | Cobertura |
|---|---|
| `categorization/repositories/json-categories.repository.test.ts` | Migración lazy `string[]` → `{name,description}[]`, write en formato nuevo, idempotencia, `add/setDescription/remove/rename` con preservación de descripción. |
| `categorization/repositories/json-default-category-overrides.repository.test.ts` | `set/reset/all`, archivo inexistente → `{}`. |
| `shared/providers/category-description-resolver.test.ts` | Default sin override → seed; default con override → override; custom con descripción → su descripción; custom sin descripción → `''`; inexistente → throw; `resolveAll()` ordena defaults primero. |
| `categorization/use-cases/update-category-description.use-case.test.ts` | Default y custom path, validación de longitud, `NOT_FOUND`, normalize de nombre, trim. |
| `categorization/use-cases/reset-category-description.use-case.test.ts` | Default con override → resetea + devuelve seed; default sin override → no-op; custom → `VALIDATION_ERROR`. |
| `categorization/use-cases/list-categories.use-case.test.ts` (extender) | Output incluye `description` efectiva. |
| `categorization/use-cases/create-category.use-case.test.ts` (extender) | `description` opcional, default `''`, max 240. |
| `transactions/use-cases/add.use-case.test.ts` (extender) | `manual`/`override`/`classifier`/`fallback` paths con `FakeTransactionClassifier`. |
| `apps/ai/src/agent/instructions.test.ts` (extender) | Dado `categoriesWithDescriptions: [{name:'comida', description:'X'}]`, el prompt contiene `- comida: X`. |

**No se testea:** workflow Mastra (LLM no determinístico), agente conversacional (LLM no determinístico), UI (no hay test runner UI en este repo), eval del classifier (manual via script).

## 11. Implementation order (input para writing-plans)

1. **Domain shape** — `apps/api/src/shared/domain/{category,custom-categories,default-category-overrides,transaction}.ts` y el mirror `apps/ai/src/shared/domain/category.ts`. Compila, no funciona end-to-end.
2. **Repos + providers** — `JsonCategoriesRepository` con migración lazy, `JsonDefaultCategoryOverridesRepository`, `CategoryDescriptionResolver`. Verificar que `apps/api/src/shared/providers/json-store.ts` serializa writes con una mutex; si no, agregarla (las descripciones se pueden editar concurrentemente desde UI y desde tool conversacional). Tests.
3. **Use-cases nuevos + extendidos** — `UpdateCategoryDescription`, `ResetCategoryDescription`, `ListCategories` extendido, `CreateCategory` extendido. Tests.
4. **Controller + schemas HTTP** — 2 endpoints nuevos. Smoke manual con `curl`.
5. **Cherry-pick + generalize del workflow Mastra** — agent + workflow + `classification.ts`. Registro en `mastra/index.ts`. Smoke manual con `curl` a `localhost:4111`.
6. **Gateway + tools de Mastra** — `categorization.gateway.ts` extendido, `http-categorization.gateway.ts`, 2 tools nuevas.
7. **`HttpTransactionClassifier` + wire en `AddTransaction`** — `Transaction` schema, `AddTransaction.execute()` ramifica, `TransactionsModule` wire. Tests.
8. **Prompt del agente** — `instructions.ts` + `gasti-agent.ts` `requestContextSchema` + caller. Test extendido del prompt.
9. **UI** — header + ruta + feature folder `settings/`.
10. **Eval fixture + script** — `scripts/eval-classifier.ts`, `data/eval/classifier-fixture.json` (20–30 entries hand-curated).
11. **Smoke E2E manual** — tres apps corriendo, crear tx sin categoría, editar descripción desde settings, ver que la próxima clasificación la respete.

Bloques 1–4: `apps/api` puro. 5–6: `apps/ai` puro. 7–8: integración. 9: UI puro. 10–11: validación.

## 12. Out of scope (v2 candidates)

- Coordinación con rama MP. Cuando MP merge, su `HttpPaymentClassifier` se reemplaza por nuestro `HttpTransactionClassifier` mapeando inputs (`counterparty → merchant`, `kind → direction`). Trabajo del rebase de MP, no nuestro.
- UI para crear/borrar/renombrar custom categories — sigue siendo conversacional.
- Detección proactiva de inconsistencias ("noté que cambiaste 3 veces Coto de comida a otros, querés ajustar la descripción?").
- Confidence visible en la UI de transacciones.
- Timeout custom en el cliente HTTP del classifier.
- Métricas, tracing, eval automatizada en CI.

## 13. Files touched / created (resumen)

**`apps/api`:**
- M `shared/domain/category.ts`
- M `shared/domain/custom-categories.ts`
- A `shared/domain/default-category-overrides.ts`
- M `shared/domain/transaction.ts`
- A `shared/providers/category-description-resolver.ts`
- A `categorization/domain/transaction-classifier.ts`
- A `categorization/providers/http-transaction-classifier.ts`
- M `categorization/repositories/json-categories.repository.ts`
- A `categorization/repositories/json-default-category-overrides.repository.ts`
- A `categorization/use-cases/update-category-description.use-case.ts`
- A `categorization/use-cases/reset-category-description.use-case.ts`
- M `categorization/use-cases/list-categories.use-case.ts`
- M `categorization/use-cases/create-category.use-case.ts`
- M `categorization/interface/categorization.controller.ts`
- M `categorization/interface/categorization.schemas.ts`
- M `categorization/categorization.module.ts`
- M `transactions/use-cases/add.use-case.ts`
- M `transactions/transactions.module.ts`
- A tests (~7 archivos)

**`apps/ai`:**
- M `shared/domain/category.ts` (mirror del cambio de shape de apps/api)
- A `categorization/agents/transaction-classifier.agent.ts`
- A `categorization/workflows/classify-transaction.workflow.ts`
- A `categorization/domain/classification.ts`
- M `categorization/domain/categorization.gateway.ts`
- M `categorization/providers/http-categorization.gateway.ts`
- M `categorization/interface/categorization.tools.ts`
- M `agent/instructions.ts`
- M `agent/gasti-agent.ts` (requestContextSchema: categories → categoriesWithDescriptions)
- M `mastra/index.ts` (middleware: registrar classifyTransaction workflow + arma categoriesWithDescriptions en requestContext)
- M `agent/instructions.test.ts`

**`apps/ui`:**
- A `shared/ui/app-header.tsx`
- M `app/layout.tsx`
- A `app/settings/categories/page.tsx`
- A `settings/` feature folder completo (~6 archivos)

**Root:**
- A `scripts/eval-classifier.ts`
- A `data/eval/classifier-fixture.json`
