import { app } from "./app";

const port = Number(process.env.PORT ?? 3000);
export default { port, fetch: app.fetch };
console.log(`urb-agents-console listening on :${port}`);
