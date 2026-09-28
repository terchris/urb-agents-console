# CLAUDE.md

This repo (`urb-agents-console`) is the web console for the urb-agents bus: the fleet live at fleet.<domain> and api-fleet.<domain>, and later a place to act on the bus. Hono on Bun, deployed on UIS with ArgoCD.

The repo uses the URB AI-developer workflow. **Before doing anything else, read the docs in
[`docs/ai-developer/`](docs/ai-developer/).**

## Start here (in order)

1. **``docs/ai-developer/project-urb-agents-console.md``** —
   the authoritative description of *this* repo: what it is, where code lives, which commands to
   run, which framework docs apply, and the non-negotiable contracts. **Read this first.**
2. **[`docs/ai-developer/README.md`](docs/ai-developer/README.md)** — how the AI-developer
   system works and the full reading order.
3. Reference these as needed — **only if `project-*.md` says they apply**:
   - `WORKFLOW.md` — idea → plan → implementation
   - `PLANS.md` — plan/investigation structure
   - `GIT.md` — git safety; GitHub `gh` vs Azure DevOps `az`
   - `AZURE-DEVOPS.md` — only if `origin` is Azure DevOps
   - `WORKTREE.md`, `DEVCONTAINER.md`
   - `SECURITY.md` — before writing anything sensitive into a published site

**Fleet coordination is not in this repo.** The protocol lives in `terchris/urb-agents`
(`protocol/communication.md`), read remotely — do not clone urb-agents and do not copy `protocol/`
here. This agent's inbox is a **query, not a directory**: `urb inbox --id urb-agents-console`, which
is open issues labelled `to:urb-agents-console`. See ``COORDINATION.md``
for where `gh` applies and where `urb` does.

**There is no file bus.** `talk/`, `TALK.md` and `mailboxes/` were all retired; nothing reads them.
If you find one in your project repo, delete it — unless it is a **product** document that happens
to be called `TALK.md` (for example under `website/docs/` or `docs/`), which is yours to keep.

Plans live in [`docs/ai-developer/plans/`](docs/ai-developer/) (`backlog/`, `active/`,
`completed/`). Current triage is ``docs/ai-developer/plans/backlog/1PRIORITY.md``.
Keep it true on a change, not on a timer.

