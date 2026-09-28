# project-urb-agents-console

The authoritative description of **this** repository. Framework docs (`WORKFLOW.md`, `GIT.md`, …)
yield to this file when they disagree.

## What this repo is

`terchris/urb-agents-console` is **the web console for the urb-agents bus**, the GitHub-issues bus
the Urbalurba agent fleet coordinates through. In phase 1 it shows the fleet's activity close to
real time, publicly. Later it becomes the place Terje logs in to act on the bus, first of all to
answer the tasks addressed to him. Its agent is **`urb-agents-console`**.

The design was agreed with Terje on 2026-09-28. The full reasoning is in
`docs/ai-developer/plans/backlog/INVESTIGATE-urb-agents-console.md` in `terchris/urb-agents` (read
it with `urb cat`). This file is what you need day to day.

## Decided (Terje, 2026-09-28)

| | |
| --- | --- |
| Framework | **[Hono](https://hono.dev/)**, deliberately: Terje is trialling it before a bigger project. **Record what you learn about Hono** in `docs/hono-notes.md`, the good and the bad. That record is half the point of this repository. |
| Runtime | **Bun**, the same runtime as `urb` |
| Deployment | **ArgoCD**, from `manifests/`, on UIS |
| Hostnames | `fleet.<domain>` is the frontend; `api-fleet.<domain>` is the public API. `<domain>` is `localhost` on a local cluster and, for example, `urbalurba.com` on imac's. |
| API description | **The API is OpenAPI 3.1.** It is served at `api-fleet.<domain>/v1/openapi.json` and generated from the same Zod schemas that validate requests (`@hono/zod-openapi`, `doc31`), so the spec cannot drift from the code. A test checks that the `Event` schema is exactly the contract. |
| Public data | events with the model: time, what happened, sender, recipient, new state, provider, model. **Never** titles, bodies, task numbers or the subscription. |

## The design

```
                private side                                        public side
GitHub bus ──urb events──> collector ──writes──> Postgres <──reads── Hono web app ──> fleet.<domain>
             (read-only bus token)                                                  └> api-fleet.<domain>
```

- **One image, two roles.** The **collector** runs as exactly one replica: every minute,
  `urb events --since <mark> --json`, insert the rows, move the mark. It is the only thing that
  touches the bus. The **web app** is Hono, and it reads only Postgres.
- **A public request never causes a bus read.** That keeps the fleet's GitHub rate limit and the
  private repository out of reach of the internet. What may be published is decided once, when a
  row is written.
- **UIS provisions, ArgoCD deploys.** Postgres comes from
  `uis configure postgresql --app urb-agents-console`. The web app and the collector are this
  repository's `manifests/`. This is the first application that does both, so report where UIS
  falls short, to tor-agent on the bus.

## Hostnames, and the one rule about `api-`

| host | serves | route |
| --- | --- | --- |
| `fleet.<domain>` | the frontend; in phase 2, the logged-in API under `/api/`, on the same origin | the platform's own, from `uis argocd register fleet …` |
| `api-fleet.<domain>` | **the public, credential-free, read-only** event feed under `/v1/` | this repository's `manifests/ingressroute-api.yaml` |

🔴 **`api-` is a security decision, not a style.** At the Cloudflare edge every `api-*` host gets
`Access-Control-Allow-Origin: *`, so any website may read it from JavaScript. See UIS's
`networking/cloudflare-setup.md`, "api- and api. are reserved prefixes". **Never put an
authenticated or private endpoint behind `api-fleet`.** A browser will not send login cookies to a
`*` origin anyway, so the logged-in API belongs on `fleet.<domain>`.

## Layout

| path | what |
| --- | --- |
| `src/app.ts` | the Hono app: `/healthz`, `/` (frontend), and `/v1` mounted from `src/api.ts` |
| `src/api.ts` | the public API: `/v1/events`, `/v1/agents`, `/v1/openapi.json` (OpenAPI 3.1) |
| `src/event.ts`, `src/allowlist.ts` | the one door a bus row comes in by: known fields only, unlisted ids folded to `others` |
| `src/store.ts` | `PgStore` (Bun.sql) and `MemoryStore`, one interface |
| `src/collector.ts` | the collector: `urb events` → Postgres, every minute |
| `config/init-database.sql` | the schema, applied by UIS (`uis configure postgresql --init-file`) |
| `tools/fake-urb.ts` | stands in for `urb events` until it is released |
| `src/index.ts` | the Bun entry point (port 3000) |
| `src/*.test.ts` | `bun test` |
| `Dockerfile` | `oven/bun`, runs as the non-root `bun` user |
| `manifests/` | Deployment `fleet-web`, Service `fleet-service` (the first Service, which the platform routes to), and the `api-fleet` IngressRoute. `collector.yaml` (`fleet-collector`) is not in the kustomization until its Secrets exist |
| `.github/workflows/build-and-push.yaml` | builds `ghcr.io/terchris/urb-agents-console:<sha>-<time>` and commits the tag to `manifests/deployment.yaml` |
| `docs/ai-developer/` | this folder. There is no second copy. |

## Commands

```bash
bun install
bun run dev          # hot-reloading server on :3000
bun test                     # the Postgres half runs when TEST_DATABASE_URL names a database it may wipe
bun run typecheck
DATABASE_URL=… URB_BIN=tools/fake-urb.ts bun src/collector.ts   # the collector against the fake urb
```

Every push to `main` builds an image and commits a new tag to `manifests/`. The workflow writes to
`main` too, so **pull before you work**.

## Git host

GitHub. `origin` is `terchris/urb-agents-console`, and it is **public**. `GIT.md` applies;
`AZURE-DEVOPS.md` does not.

## Devcontainer

No.

## Contracts (non-negotiable)

1. **The repository is public: no secret ever enters it.** The bus token and the database password
   reach the cluster as Kubernetes Secrets. How they get there is UIS's documented gap (a cluster
   rebuilt from git alone has no application secrets), so say where it bites rather than work
   around it.
2. **Only the collector touches the bus, and only through `urb`.** Never build a GitHub call or a
   label yourself; that is the fleet's rule. The image carries the Linux `urb` build of the release
   `fleet/cli-version` routes, checked against the published `SHA256SUMS`.
3. **The public side serves only publishable fields.** `urb events` is publishable by construction.
   Do not add a field to a public endpoint that it does not emit, and never the subscription.
4. **Terje decides exposure:** which cluster, the public hostname, and anything that makes more
   public. **Phase 3 (acting on the bus) needs a write credential in the cluster, and it is not
   built before its own security review with him.**
5. **Terje reads anything published before it is published.** That is the organisation's rule on
   AI-written material.

## URB fleet

- Agent id: `urb-agents-console`
- Inbox: `~/.local/bin/urb inbox --id urb-agents-console`, a query on `terchris/urb-agents`
- Do not clone urb-agents. Do not copy `protocol/` here.
- **`urb events`** is urb-agents-maintainer's to build. Ask there for anything the contract lacks.
  The marketing agent is the first consumer of `api-fleet`.

## Other documentation

- Hono: https://hono.dev/
- UIS, deploying an application: `contributors/rules/application-deployment.md` in
  `helpers-no/urbalurba-infrastructure`
