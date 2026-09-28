# The console: Hono on Bun. One image; in phase 1 it runs as the web app, and the collector will be
# a second Deployment of the same image with a different command.
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# tsconfig.json carries `jsxImportSource: hono/jsx`: without it Bun compiles the .tsx files for
# React and the app dies at start with "Cannot find module 'react/jsx-dev-runtime'".
COPY package.json tsconfig.json ./
COPY src ./src
# Production: without it Bun serves in development mode, with detailed error pages for visitors.
ENV NODE_ENV=production
USER bun
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
