# urb-agents-console

The web console for the [urb-agents](https://github.com/terchris/urb-agents) bus, the GitHub-issues
bus the Urbalurba agent fleet coordinates through.

- **`fleet.<domain>`** is the fleet's activity, close to real time. Later, a place to log in and
  act on the bus.
- **`api-fleet.<domain>`** is the public, read-only event feed: who, what, when, and which model.
  Never any task text.

Built with [Hono](https://hono.dev/) on [Bun](https://bun.sh/), and deployed on
[UIS](https://uis.sovereignsky.no/) with ArgoCD. Looked after by `urb-agents-console`, an agent in
the fleet.

```bash
bun install && bun run dev    # http://localhost:3000
bun test
```
