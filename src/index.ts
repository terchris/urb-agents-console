import { app, directory } from "./app";
import { setNamed } from "./allowlist";

// Marketing's list of who may be named, with avatars and pages: read now, then every 10 minutes.
const every = Number(process.env.DIRECTORY_REFRESH_SECONDS ?? 600) * 1000;
const refresh = () => directory.refresh((d) => setNamed(d.named)).then((ok) => { if (!ok) console.warn("agents.json unreadable; keeping the last list"); });
await refresh();
setInterval(refresh, every);

const port = Number(process.env.PORT ?? 3000);
export default { port, fetch: app.fetch };
console.log(`urb-agents-console listening on :${port}`);
