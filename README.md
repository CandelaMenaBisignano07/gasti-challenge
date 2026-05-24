# Gasti prueba tecnica

> Docs de dominio: `[PRODUCT.md](./PRODUCT.md)`·
> Design system `[DESIGN.md](./DESIGN.md)` 
> Rules tecnicas`[CLAUDE.md](./CLAUDE.md)` 
> Workflow con IA y experiencia con Mastra `[WRITEUP.md](./WRITEUP.md)`.

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

Abrí **[http://localhost:3000](http://localhost:3000)**. La API responde en `http://localhost:3001/health` y el
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
cd apps/api && bun test    # 201 tests — proyección, overrides, insights, mutaciones, MP polling y backfill
```

> Para probar el polling de Mercado Pago en local hay que crear una app en el panel de MP
> Developers y poblar las env vars correspondientes. Ver la sección **Setup de Mercado
> Pago** abajo. Sin esas vars la app levanta igual: el chip de MP queda en "Conectar" y
> el cron de polling se saltea al usuario.

---

## Setup de Mercado Pago

Para que la integración funcione hace falta una **aplicación de Mercado Pago Developers**
propia: MP usa OAuth Connect, así que tu app actúa como cliente OAuth y los pagos del
usuario quedan accesibles con un access token emitido a tu `CLIENT_ID`.

### 1. Crear la aplicación en el panel de MP

1. Entrar a **[Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app)** y
  loguearte con la cuenta de MP que vaya a actuar como dueña de la app (no es la cuenta
   que va a *usar* Gasti — esa se conecta después vía OAuth).
2. Click en **Crear aplicación** (esquina superior derecha).
3. **Nombre** para identificarla (máx. 50 caracteres, p. ej. `gasti-local`).
4. **Solución:** "Pagos online".
5. **Producto a integrar:** "Checkout API" alcanza. (El producto no se usa para nada
  funcional — Gasti no cobra pagos, solo lee — pero MP exige elegir uno).
6. Aceptar términos y crear.

### 2. Exponer un callback público con un túnel

El `Redirect URI` que se le configura a la app **no puede ser `localhost`**: MP redirige al
usuario después del OAuth y rechaza esquemas no públicos. Para desarrollo usá un túnel
HTTPS gratuito apuntado a `http://localhost:3001` (donde corre la API):

```bash
# opción 1 — ngrok
ngrok http 3001

# opción 2 — cloudflared
cloudflared tunnel --url http://localhost:3001
```

El túnel te da una URL del tipo `https://xxxx.ngrok-free.app`. Esa es la **base** del
redirect URI, no la URL final.

### 3. Configurar el Redirect URI en la app

Volver al panel → tu app → **Editar** y poner en `Redirect URL`:

```
https://<tu-tunel>.ngrok-free.app/mp/oauth/callback
```

Exactamente esa ruta (`/mp/oauth/callback` es donde el `mp-oauth.controller.ts` recibe el
`code`). Guardar.

### 4. Copiar las credenciales

En el panel de la app, sección **Credenciales** → copiar **Client ID** y **Client Secret**
(las de producción; para personal MP no exige el modo "Test User" si el flujo es OAuth con
tu propia cuenta).

### 5. Poblar los `.env`

En `apps/api/.env`:

```bash
MP_CLIENT_ID=<el client id de la app>
MP_CLIENT_SECRET=<el client secret de la app>
MP_REDIRECT_URI=https://<tu-tunel>.ngrok-free.app/mp/oauth/callback
# Clave AES-256-GCM para encriptar los access tokens en disco (no se sube a git).
# Generarla una vez:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
TOKEN_ENCRYPTION_KEY=<32-byte base64>
```

En `apps/ui/.env` (para que el botón "Conectar MP" lleve a la URL del túnel y no a
`localhost:3001`):

```bash
NEXT_PUBLIC_MP_OAUTH_BASE_URL=https://<tu-tunel>.ngrok-free.app
```

### 6. Conectar tu cuenta personal

`bun dev`, abrir `http://localhost:3000`, tappear el chip **Conectar Mercado Pago** del
header → loguearte con la cuenta personal que querés que Gasti lea (puede ser distinta de
la que creó la app). Al volver del callback aparece el `BackfillModal` para elegir cuánto
importar (default: skip). Desde ahí, el cron de cada 2 min va trayendo pagos nuevos.

> Las credenciales OAuth de MP duran **6 meses**. Si vencen, hay que reconectar; el
> refresh token está implementado y Gasti lo renueva solo mientras la sesión esté vigente.

---

## Tools del agente

El agente tiene 32 tools que pensé agrupadas por feature. Pensé que una persona cuando usa esta aplicación quiere saber cómo ahorrar más plata, y para eso tiene que tener
claro cómo se mueve y sus objetivos. Para lo primero existen las features de
gastos, ingresos y transacciones; para lo segundo, presupuestos, metas e insights que
detectan patrones y vuelven al agente proactivo. Por encima de todo eso hay un módulo de categorización para que el usuario personalice su experiencia (es más customización que dominio en sí, pero se trata como feature aparte).

La mayoría de las tools renderizan una **card** en el chat: el agente sólo escribe la
oración titular y la card aparece sola (ver "Cards" en decisiones de producto más abajo).

### Spending — el piso conversacional (5)


| Tool                   | Card              | Por qué                                                           |
| ---------------------- | ----------------- | ----------------------------------------------------------------- |
| `sumSpendByCategory`   | `stat`            | Cubre preguntas comunes como "¿cuánto gasté en comida este mes?". |
| `getSpendingBreakdown` | `rankedList`      | Desglose ranqueado: "¿en qué gasté más?".                         |
| `getTopMerchants`      | `rankedList`      | Te dice en qué comercios gastás más plata.                        |
| `listTransactions`     | `transactionList` | Lookup filtrado por comercio / categorías / período.              |
| `compareSpending`      | `compareList`     | "Compará abril vs mayo" con deltas por categoría.                 |


### Insights — lo proactivo (3)


| Tool                     | Card          | Por qué                                                                                             |
| ------------------------ | ------------- | --------------------------------------------------------------------------------------------------- |
| `projectMonthEnd`        | `stat`        | Proyecta el cierre del mes con los datos hasta la fecha, y avisa cuando no alcanzan para proyectar. |
| `detectRecurringCharges` | `bulletList`  | Detecta suscripciones                                                                               |
| `detectCategorySpikes`   | `compareList` | Categorías que saltaron fuerte vs. el mes anterior.                                                 |


Los insights pueden ser un add-on opcional a una pregunta genuina

### Budgets — coaching de presupuesto (3)

`setBudget`, `clearBudget`, `getBudgetProgress` — maneja un presupuesto mensual por
categoría desde la conversación y nos ayudan a saber si vamos al margen, si gastamos de
más, etc. `getBudgetProgress` renderiza una card `budgetProgress` con barra y delta.

### Income — marco contra ingresos (2)

`declareIncome` (recurrente o one-off) y `getCashFlow` (flujo neto + tasa de ahorro
aproximada). Sin ingreso declarado Gasti solo muestra gastos; con ingreso, contexto.

### Categorization — categorías y correcciones (9)

Overrides: `overrideMerchantCategory` y `overrideTransactionCategory` (precedencia
transacción → comercio → semilla). Cambios sobre el catálogo: `createCategory`,
`renameCategory`, `deleteCategory`, `listCategories` (card `bulletList`),
`updateCategoryDescription` y `resetCategoryDescription` (la descripción semántica viaja
al classifier de MP y al prompt del agente, así una categoría custom queda bien
desambiguada). Toda eliminación o rename pasa por `proposeCategoryChange` (read-only,
muestra una card de `optionPills` con conteo de transacciones afectadas).

**El usuario puede crear, renombrar y borrar sus propias categorías** más allá de las 7
por defecto — una decisión de producto, ver abajo.

### Transactions — mutaciones con confirmación (4)

`addTransaction` (directa, no destructiva), `proposeTransactionMutation` (read-only,
resuelve el target y renderiza `optionPills` cuando hay un único match o
`transactionList` cuando hay varios), `updateTransaction` y `deleteTransaction`
(**gated**: solo corren después de una propuesta y una confirmación explícita del usuario).
Una baja o edición nunca pasa como efecto colateral de un turno no relacionado.

### Goals — metas de ahorro (5)

`setGoal`, `listGoals`, `getGoalProgress`, `clearGoal`, `assessGoalRisk`. **No estaba en
el brief** — lo agregué porque "¿llego a juntar para X?" es una pregunta natural de
finanzas personales y cierra el triángulo gasto/presupuesto/ahorro.

### Cancel — escape hatch (1)

`cancel` — el agente puede invocarla para descartar una propuesta de mutación pendiente
sin tener que esperar el próximo turno. La UI también la dispara cuando el usuario tappea
"Cancelar" en la card.

---

## Decisiones de producto

- **Categorías custom con descripción semántica.** Hay 7 categorías core fijas y, más allá
de eso, el usuario puede crear, renombrar, borrar y **describir** las categorías que
quiera. Si nombrás una categoría que no existe, Gasti te ofrece crearla en vez de caer en
`otros` en silencio. La descripción de cada categoría viaja al prompt del agente y al
classifier de MP, así una categoría custom como "rituales del finde" queda bien
desambiguada al clasificar transacciones nuevas.
- **Integración real con Mercado Pago vía polling.** OAuth Connect + polling a
`/v1/payments/search` cada 2 minutos. Pivoteé del diseño original con webhook después de
comprobar empíricamente que MP solo dispara webhooks para movimientos creados por
integraciones (Checkout / Bricks): los pagos reales de un usuario (P2P, transferencias,
recurrentes, compras en comercios) no generan notificación. El polling es la única forma
de capturar el panorama completo. Ver
`docs/superpowers/specs/2026-05-22-mp-polling-pivot-design.md`.
- **Backfill al conectar.** Al volver del callback de OAuth aparece un modal que pregunta
si querés importar 24h / 7d / 15d / 30d hacia atrás o arrancar limpio (default: skip). El
backfill clasifica las transacciones en **batch** (un solo LLM call con el lote completo,
un Workflow de Mastra dedicado) y deja en el thread una `BackfillSummaryCard` con el
resumen y los movimientos de baja confianza pinneados arriba para revisar.
- **Status events de MP, no solo altas.** Una transacción ingresada por MP puede después
cancelarse o sufrir un chargeback reembolsado. El polling detecta esos cambios de status
y reflejan en el chat como un `ProactiveNoticeCard` ("Te cancelaron el pago de X").
- **Mutaciones con confirmación en la conversación.** Antes de eliminar o editar una  
transacción hay un filtro de confirmación explícito. Si justo después del mensaje de  
confirmación el usuario salta a otro tema, la propuesta se da por cancelada — así el LLM  
no alucina una baja que nunca se confirmó. La UI lo renderiza como pills  
`Sí, borralo` / `Cancelar`, sin modal rojo.
- **Tool-calls visibles.** Cada respuesta muestra qué tools llamó Gasti y con qué inputs.  
Es una feature de confianza: la respuesta es verificable, no alucinada.
- **Cards ricas para resultados estructurados.** 7 tipos de card —
`transactionList`, `budgetProgress`, `stat`, `rankedList`, `compareList`, `bulletList`,
`optionPills` — emitidas desde el `transform.display` de cada gateway tool. El agente
solo escribe la oración titular; los datos los renderiza la card. Lo que ve el LLM es el
payload "limpio"; lo que ve el usuario es la card.
- **Errores honestos.** Toda tool envuelve su `outputSchema` con un sobre de error: si la
API falla, la tool devuelve `{ error, code, message }` válido y el agente narra la falla.

---

## Qué dejaría para después

- **Más plataformas proactivas.** Hoy la única fuente push es Mercado Pago. El mismo
contrato (`PaymentClassifier` + `ProactivePromptCard` + SSE) está pensado para sumar
Modo, Ualá, Naranja X, tarjetas vía resumen bancario, etc. — cada una con su propio
gateway y cursor de polling, sin tocar el agente.
- **Chat por voz.** Que el usuario pueda dictar "gasté 8 lucas en supermercado" sin tipear.
Whisper para STT en el cliente, y la respuesta del agente leída con TTS. La capa de tools
no cambia — es solo otra forma de entrada/salida.
- **Foto al recibo → transacción.** Sacarle una foto al ticket y que se cree la
transacción sola: visión multimodal para extraer comercio, monto, fecha e ítems, y
enchufarlo al pipeline de clasificación existente. Llena el hueco donde el comercio
acepta efectivo y no hay rastro en MP.
- **Múltiples chats con un sidebar de listado.** Hoy hay un único thread por usuario;
tendría sentido poder mantener varios chats en paralelo (uno para "presupuesto
mensual", otro para "viaje a Bariloche", etc.) y una UI tipo sidebar que los liste,
permita renombrar, archivar y saltar entre ellos. Mastra ya scopea memoria por
`resourceId` + `threadId`, así que lo que falta es la UI del listado más persistir el
catálogo de threads del usuario.
- **Tags libres en transacciones.** Para complementar las categorías custom — un mismo
gasto podría llevar `#viaje-bariloche` además de su categoría. Sin implementar.
- **Persistencia con base de datos real.** Hoy los datos de dominio son JSON. Para
multi-usuario o concurrencia haría falta SQLite/Postgres detrás de los mismos contratos
de repositorio — el swap es por DI, el dominio no se entera.
- **Más workflows de Mastra.** Hoy uso un solo Workflow (`classify-batch` para el
backfill). El polling per-event sigue siendo un HTTP call directo al classifier; podría
promoverse a un Workflow con pasos determinísticos (`fetch → classify → persist → publish`) si el flujo crece en complejidad.
- **Tests de la UI** y una suite e2e que cubra el flujo de chat completo + el OAuth de MP.
- **Multi-usuario / auth.** Fuera de scope de v1; el modelo ya scopea por `userId` y el
scheduler ya itera sobre la tabla de usuarios.
- **Refresco manual del polling.** Hoy el cron de 2 min es la única fuente. Un botón
"actualizar ahora" tendría sentido pero requiere semáforo de in-flight y cooldown
cliente — la decisión actual fue mantenerlo simple.

---

## Loom
