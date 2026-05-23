# Gasti prueba tecnica

> Docs de dominio: [`PRODUCT.md`](./PRODUCT.md)·
> Design system [`DESIGN.md`](./DESIGN.md) 
> Rules tecnicas[`CLAUDE.md`](./CLAUDE.md) 
> Workflow con IA y experiencia con Mastra [`WRITEUP.md`](./WRITEUP.md).

## Cómo correrlo localmente

**Requisitos:** [Bun](https://bun.sh) `1.3+` y una API key de OpenAI.

```bash
# 1. Dependencias
bun install

# 2. Variables de entorno del agente
cp apps/ai/.env.example apps/ai/.env
#    → editá apps/ai/.env y poné tu OPENAI_API_KEY

# 3. Variables de entorno de la UI
cp apps/ui/.env.example apps/ui/.env
#    → asegurate de que MASTRA_BASE_URL apunte al dev server de Mastra:
#      MASTRA_BASE_URL=http://localhost:4111

# 4. Levantar las tres apps en paralelo
bun dev
```

Abrí **http://localhost:3000**. La API responde en `http://localhost:3001/health` y el
playground de Mastra en `http://localhost:4111`.

Apps por separado, si hace falta:

```bash
bun dev --filter=api      # NestJS
bun dev --filter=ui       # Next.js
bun dev --filter=ai       # Mastra dev playground
bun run build             # build de las tres (Turbo)
```

**Tests** (use-cases de `apps/api`):

```bash
cd apps/api && bun test    # 66 tests — proyección, overrides, insights, mutaciones
```
---

## Tools del agente 

El agente tiene 28 tools que las pense agrupadas por feature. Pense que una persona cuando recurre a esta aplicacion quiere saber como ahorrar mas plata, para eso deberiamos tener en cuenta como la plata se mueve y tener claros nuestros objetivos. Para el primer punto existe la feature de gastos, ingresos y transacciones (la diferencia con gastos es que en ), para el segundo punto tenemos presupuestos, logros a los que queremos llegar e insights para descubrir patrones y volver a nuestro agente proactivo, y por ultimo tenemos un modulo de categorizacion para que el usuario pueda personalizar mas su experiencia (se lo separa como feature pero tiene que ver mas con la experiencia de usuario y customizacion, no con el dominio en si). 

### Spending — el piso conversacional (5)

| Tool | Por qué |
|---|---|
| `sumSpendByCategory` | Cubre preguntas comunes como "¿cuánto gasté en comida este mes?".|
| `getSpendingBreakdown` | Desglose ranqueado: "¿en qué gasté más?". |
| `getTopMerchants` | Te dice en que comercios gastas mas plata.|
| `listTransactions` | Lookup filtrado por comercio / categorías / período; renderiza una card. |
| `compareSpending` | "Compará abril vs mayo" con deltas por categoría. |

### Insights — lo proactivo (3)

| Tool | Por qué |
|---|---|
| `projectMonthEnd` | Proyecta el cierre del mes con los datos que se tienen hasta la fecha, pero avisa cuando los datos que se tienen no son los suficientes como para proyectar. |
| `detectRecurringCharges` | Detecta suscripciones — el "streaming que te sangra sin que mires". |
| `detectCategorySpikes` | Categorías que saltaron fuerte vs. el mes anterior. |

Los insights **nunca se ofrecen solos**: son un add-on opcional a una pregunta genuina, y
nunca aparecen en un turno de mutación.

### Budgets — coaching de presupuesto (3)

`setBudget`, `clearBudget`, `getBudgetProgress` — maneja un presupuesto mensual por categoría desde la conversación y nos ayudan a saber si vamos al margen de ese presupuesto, si gastamos de mas, etc.

### Income — marco contra ingresos (2)

`declareIncome` (recurrente o one-off) y `getCashFlow` (flujo neto + tasa de ahorro
aproximada). Sin ingreso declarado Gasti solo muestra gastos; con ingreso, contexto.

### Categorization — categorías y correcciones (6)

`overrideMerchantCategory` y `overrideTransactionCategory` (corregir a nivel comercio o a
nivel transacción, con precedencia transacción → comercio → semilla). `createCategory`,
`renameCategory`, `deleteCategory`, `listCategories`: **el usuario puede crear sus propias
categorías** más allá de las siete por defecto — una decisión de producto, ver abajo.

### Transactions — mutaciones con confirmación (4)

`addTransaction` (directa, no destructiva), `proposeTransactionMutation` (read-only,
resuelve el target), `updateTransaction` y `deleteTransaction` (**gated**: solo corren
después de una propuesta y una confirmación explícita del usuario). Una baja o edición
nunca pasa como efecto colateral de un turno no relacionado.

### Goals — metas de ahorro (5)

`setGoal`, `listGoals`, `getGoalProgress`, `clearGoal`, `assessGoalRisk`. **No estaba en
el brief** — lo agregué porque "¿llego a juntar para X?" es una pregunta natural de finanzas
personales y cierra el triángulo gasto/presupuesto/ahorro.

---

## Decisiones de producto

- **La lógica de negocio vive en `apps/api`, no en las tools.** Las tools definen cómo el
  agente llama a la app — no deberían conocer la lógica de negocio. El brief admitía
  mantener todo en la working memory de Mastra; lo moví a use-cases NestJS con repositorios
  JSON, así el dominio queda testeable (66 tests) y las tools quedan finas. La working
  memory de Mastra es solo un **espejo** del estado relevante (presupuestos, metas, ingreso)
  para proactividad barata.
- **Categorías custom.** Hay 7 categorías core fijas y, más allá de eso, el usuario puede
  crear, renombrar y borrar las categorías que quiera. Si nombrás una categoría que no
  existe, Gasti te ofrece crearla en vez de caer en `otros` en silencio: una transacción
  nunca termina en una categoría default sin que lo sepas y lo puedas revertir.
- **Mutaciones con confirmación en la conversación.** Antes de eliminar o editar una
  transacción hay un filtro de confirmación explícito. Si justo después del mensaje de
  confirmación el usuario salta a otro tema, la propuesta se da por cancelada — así el LLM
  no alucina una baja que nunca se confirmó. La UI lo renderiza como pills
  `Sí, borralo` / `Cancelar`, sin modal rojo.
- **Metas de ahorro** como feature de pleno derecho (ver tools arriba).
- **Tool-calls visibles.** Cada respuesta muestra qué tools llamó Gasti y con qué inputs.
  Es una feature de confianza: la respuesta es verificable, no alucinada.
- **Grounding estricto.** Gasti nunca inventa un número; si una tool no trae datos lo dice.
  El silencio le gana a un número fabricado.
- **Bilingüe de entrada, español de salida.** Entiende cualquier idioma; siempre responde
  en español rioplatense, con formato de moneda `es-AR` (`$1.234,56`).
- **Cards ricas para resultados estructurados.** `listTransactions` y `getBudgetProgress`
  se renderizan como cards; el agente solo escribe la oración titular. Se logró con el hook
  `transform.display` de Mastra, sin contaminar lo que ve el LLM.
- **Errores honestos.** Toda tool envuelve su `outputSchema` con un sobre de error: si la
  API falla, la tool devuelve `{ error, code, message }` válido y el agente narra la falla.

---

## Qué dejaría para después

- **Integración real con Mercado Pago.** Diseñada por completo (cards proactivas vía
  webhook, OAuth Connect, modelo multi-tenant — ver
  `docs/superpowers/specs/2026-05-14-proactive-mercadopago-design.md`). Descoporada por
  presupuesto de tiempo: requería ngrok, OAuth y enmiendas a `PRODUCT.md`. Queda como spec.
- **Tags libres en transacciones.** Plan escrito
  (`docs/superpowers/plans/2026-05-18-transaction-tags.md`), sin implementar.
- **Persistencia con base de datos real.** Hoy los datos de dominio son JSON. Para
  multi-usuario o concurrencia haría falta SQLite/Postgres detrás de los mismos contratos
  de repositorio — el swap es por DI, el dominio no se entera.
- **Workflows de Mastra.** No usé `Workflow`: el loop de tool-calling del agente alcanza.
  Tendría sentido para un pipeline con pasos determinísticos (p. ej. ingestión de webhooks).
- **Tests de la UI** y un suite e2e del flujo de chat completo.
- **Multi-usuario / auth.** Fuera de scope de v1; el modelo ya scopea por `userId`.

---

## Stack

NestJS 10 · Next.js 15 (App Router) + React 19 + Tailwind 3 · Mastra `^1.33`
(`@mastra/core`, `@mastra/memory`, `@mastra/libsql`) · OpenAI `gpt-4o` vía AI SDK ·
Bun + Turborepo · Zod · `bun:test`.
