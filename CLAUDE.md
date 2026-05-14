# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Repository

Gasti Challenge: a conversational personal-finance assistant. Monorepo using **Bun workspaces + Turborepo**, TypeScript end-to-end.

```
apps/
├── ai/    # Mastra — agents, tools, workflows, memory
├── api/   # NestJS — controllers, modules, providers, DI
└── ui/    # Next.js (App Router) + Tailwind — frontend
data/      # transactions.json (mock dataset)
.mcp.json  # Mastra docs MCP server
PRODUCT.md # Product domain & constraints   (REQUIRED reading)
DESIGN.md  # Design system & visual tokens  (REQUIRED reading)
```

Three workspaces. They are independent apps glued by Turbo pipelines — keep boundaries clean.

---

## Commands

Run from the repo root:

```bash
bun install
bun dev                    # all three apps in parallel
bun dev --filter=api       # NestJS  → http://localhost:3001/health
bun dev --filter=ui        # Next.js → http://localhost:3000
bun dev --filter=ai        # Mastra dev playground
bun run build              # turbo build (all)
bun run build --filter=api # build a single workspace
```

The `ai` workspace needs `apps/ai/.env` with an LLM provider key (e.g. `OPENAI_API_KEY`) — copy from `.env.example`.

---

## The Superpowers workflow (MANDATORY)

This project follows the **Superpowers** methodology by Jesse Vincent. The Superpowers plugin must be installed. The seven skills below are the workflow — **mandatory, not suggestions**. The agent checks for relevant skills before any task and invokes them via the `Skill` tool.

Do not collapse, reorder, or skip steps. Implementation-domain skills (see "Domain skills" below) layer **on top of** this pipeline during steps 4–5; they do not replace it.

### The Basic Workflow

1. **`brainstorming`** — Activates **before writing code**. Refines rough ideas through questions, explores alternatives, presents design in sections for validation. **Saves a design document.**

2. **`using-git-worktrees`** — Activates **after design approval**. Creates an isolated workspace on a new branch, runs project setup, verifies a clean test baseline.

3. **`writing-plans`** — Activates **with approved design**. Breaks work into bite-sized tasks (**2–5 minutes each**). Every task has exact file paths, complete code, and verification steps.

4. **`subagent-driven-development`** OR **`executing-plans`** — Activates **with plan**. Dispatches a fresh subagent per task with two-stage review (spec compliance, then code quality), **or** executes in batches with human checkpoints.

5. **`test-driven-development`** — Activates **during implementation**. Enforces **RED → GREEN → REFACTOR**: write failing test, watch it fail, write minimal code, watch it pass, commit. **Deletes code written before tests.**

6. **`requesting-code-review`** — Activates **between tasks**. Reviews against the plan, reports issues by severity. **Critical issues block progress.**

7. **`finishing-a-development-branch`** — Activates **when tasks complete**. Verifies tests, presents options (merge / PR / keep / discard), cleans up the worktree.

### Additional process skills (use when triggered)

- **`systematic-debugging`** — before proposing any fix for a bug, test failure, or unexpected behavior.
- **`dispatching-parallel-agents`** — when there are 2+ truly independent tasks with no shared state.
- **`verification-before-completion`** — before declaring any task "done".

### Domain skills (layered on top of steps 4–5)

| Domain | Skills |
|---|---|
| Frontend — building UI | `frontend-design` |
| Frontend — composing components | `vercel-composition-patterns` |
| Frontend — React / Next.js code | `vercel-react-best-practices` (run in parallel with `vercel-composition-patterns`) |
| Frontend — auditing UI/UX | `web-design-guidelines` |
| AI / Mastra | use the **Mastra MCP** in `.mcp.json` (`@mastra/mcp-docs-server`) for docs — never guess Mastra APIs |

---

## Before implementing anything

Walk this pipeline. Do not skip steps. Do not reorder.

1. **Read `PRODUCT.md`** — product domain, user, constraints. Architectural choices must serve the product.
2. **Read `DESIGN.md`** — design system, tokens, spacing, colors, typography, visual patterns, component behavior. Any UI work conforms to it.
3. **Inspect existing architecture** under `apps/ai`, `apps/api`, `apps/ui` — folders, modules, providers, repositories, use-cases already present.
4. **Identify existing patterns** — naming, layering, DI wiring, file organization. Match them.
5. **Choose the correct Superpowers skills** (steps 1–7 above) and invoke them via the `Skill` tool.
6. **Plan** with `writing-plans`. Get alignment before code.
7. **Implement** following Clean Architecture (below).
8. **Validate** against `PRODUCT.md`, `DESIGN.md`, and the plan. Run `verification-before-completion`.

---

## Architecture rules

This project follows **Clean Architecture**. The layering is non-negotiable.

### Layering (in all three apps where applicable)

```
domain        ← entities, value objects, repository interfaces, pure business rules
use-cases     ← orchestrate domain + repositories; one use-case per intent
providers     ← reusable services (LLM clients, formatters, calculators, etc.)
repositories  ← concrete implementations of domain repository contracts
infrastructure← framework wiring (Nest modules, Next routes, Mastra registry, file IO)
interface     ← thin controllers (Nest), route handlers (Next), agent tools (Mastra)
```

### Feature-first organization

Group by **feature / bounded context**, not by technical role:

```
apps/api/src/
├── transactions/
│   ├── domain/
│   ├── use-cases/
│   ├── repositories/
│   ├── providers/
│   └── transactions.module.ts    # NestJS module wires DI
└── budgets/
    └── ...
```

Same shape in `apps/ai` (feature folders exposing Mastra `tools` and optionally `workflows`) and in `apps/ui` (route segments + feature folders for components/hooks).

### Concrete rules

- **Controllers / route handlers / Mastra tools are thin.** Parse input, call a use-case, return the result. No branching business logic.
- **Business logic lives in use-cases.** A use-case takes a request, depends on repository/provider **interfaces**, returns a result.
- **Repositories are contracts first.** Interface in `domain/`; implementation in `repositories/`. Swap via DI.
- **Providers are reusable.** If two use-cases would re-implement the same thing, lift it into a provider.
- **Dependency Injection everywhere.**
  - NestJS: constructor injection with `@Injectable()` and module `providers` arrays.
  - Mastra: inject dependencies into tool/workflow factories; never `import` repositories directly inside `execute`.
  - UI: keep data access behind hooks/clients passed in as props or read from context — never reach into infra from components.
- **Domain is framework-agnostic.** Domain code must not import from `@nestjs/*`, `next/*`, `@mastra/*`, or `react`. If it does, it's in the wrong layer.
- **Separation of concerns.** One file, one job. Split before a file or function grows large.

### Mastra-specific rules (apps/ai)

- **Use Mastra primitives only:** `Agent`, `createTool` (with Zod `inputSchema` / `outputSchema`), `Workflow`, `Memory` (`lastMessages`, `semanticRecall`, `workingMemory`), storage adapters.
- **Never** build a custom tool-calling loop, a homegrown agent runner, or bespoke orchestration. If you find yourself writing one, stop and reach for the Mastra primitive — consult the Mastra MCP.
- Tools call **use-cases** for business logic. The tool layer is the boundary; the work happens inside.

---

## Priority order when patterns conflict

1. **Existing project patterns** (what the repo already does)
2. **`PRODUCT.md`** (product domain & constraints)
3. **`DESIGN.md`** (visual & interaction system)
4. **Clean Architecture principles** (the rules above)
5. **Framework best practices** (Nest, Next, Mastra idioms)

Always check 1–3 before introducing a new pattern.

---

## Forbidden

These are project-level violations. Do not do them — call them out if asked to.

- ❌ Bypassing Clean Architecture (skipping use-cases, calling repositories from controllers, leaking infra into domain).
- ❌ Business logic in NestJS controllers, Next.js route handlers/components, or Mastra tools.
- ❌ Custom AI orchestration, hand-rolled tool-calling loops, or homemade abstractions over Mastra. Use Mastra primitives.
- ❌ Tightly coupling modules (cross-feature imports of internals, circular dependencies, shared mutable singletons).
- ❌ Ignoring `PRODUCT.md` when making architectural or product decisions.
- ❌ Ignoring `DESIGN.md` when building or modifying UI.
- ❌ Bypassing dependency injection (`new` inside a use-case, top-level `import` of a concrete repository in domain/use-case code).
- ❌ Creating massive components or files. Split by responsibility.
- ❌ Mixing domain logic with infrastructure concerns (HTTP, DB, filesystem, Mastra/Nest/Next APIs inside domain).
- ❌ Skipping or reordering the Superpowers seven-step workflow.

---

## Stack notes

- **Bun** is the package manager and runtime for `api` and root scripts. `ui` runs Next normally; `ai` runs via the Mastra CLI.
- **Turborepo** pipelines: `dev` is non-cached and persistent, `build` is cached, `start` depends on `build`.
- **NestJS 10** in `apps/api` — modules, providers, DI, controllers.
- **Next.js 15 (App Router) + React 19 + Tailwind 3** in `apps/ui`.
- **Mastra `^1.33`** (`@mastra/core`) + `mastra@^1.9` CLI + `@mastra/libsql` + `@ai-sdk/openai` in `apps/ai`.
