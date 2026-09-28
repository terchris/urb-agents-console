# The console: Hono on Bun. One image; in phase 1 it runs as the web app, and the collector will be
# a second Deployment of the same image with a different command.
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER bun
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
