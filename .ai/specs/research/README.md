# Research — Wine Match

Inventory of the material `om-discover` read on 2026-10-15 for `.ai/specs/product-brief.md`, and what each source can support. Tags follow `.agents/skills/om-discover/references/evidence-tiers.md`.

## What exists

| Source | What it is | Tag | What it can support | What it cannot support |
|---|---|---|---|---|
| `.ai/specs/implemented/2026-10-14-wine-match-mvp-concept.md` | MVP scope approved by the product owner (Filip) on 2026-10-14 | `[DOCUMENT]` | the scope and principles the owner chose | that restaurants or guests have the problem |
| `docs/PRODUCT_CONCEPT.md`, `docs/USER_ROLES.md`, `docs/USE_CASES.md`, `docs/USER_FLOWS.md` | the team's product concept, roles, use cases and flows | `[DOCUMENT]` for choices, `[ASSUMPTION]` for statements about users and money | what the team intends to build and why it believes so | user behaviour, demand, willingness to pay, revenue impact |
| `.ai/specs/implemented/2026-10-14-phase*.md`, `2026-10-14-monorepo-nextjs-architecture.md` | specs of what was built, owner Filip | `[DOCUMENT]` / `[PRODUCT]` | decisions about roles, import, publishing, QR | need |
| Repository code (`packages/`), `BACKWARD_COMPATIBILITY.md` | the running product | `[PRODUCT]` | what exists today | that anyone needs it |
| Demo restaurant "Halka" (`packages/core/src/demo/`) | fictional data | — | nothing about real restaurants | everything about real usage |

## What does not exist yet

- No interview with a restaurant owner, general manager, sommelier, waiter or guest.
- No sales or POS data from any restaurant (the panel's usage section says nothing has been recorded).
- No checked benchmark of competing products.
- No pilot restaurant.

Everything the product says about the problem, the users and the money is therefore a team belief. The brief keeps it as `[ASSUMPTION]` and lists what to collect in its Collection plan.

## Layout

- `interviews/` — one note per conversation, from `templates/interview-note.md`.
- `data/` — exports with a request note from `templates/data-request.md`; strip personal data before it lands here.
- `benchmarks/` — one check per product, from `templates/benchmark-check.md`.
- `decisions/` — decision records from `templates/decision-record.md`, each naming the person who decided.
