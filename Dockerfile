# Build-Stage: TypeScript nach dist/ kompilieren.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# Runtime-Stage: nur Produktions-Dependencies (pg) plus dist/ und migrations/.
# Läuft als unprivilegierter node-User. dist/ und migrations/ sind node-owned;
# node_modules bleibt root-owned (wird nur gelesen).
FROM node:22-alpine
WORKDIR /app
RUN chown node:node /app
ENV NODE_ENV=production
RUN corepack enable
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --chown=node:node --from=build /app/dist ./dist
# Der Migrations-Runner liest ../../migrations/ relativ zu dist/db/ –
# ohne den Ordner crasht der Start.
COPY --chown=node:node migrations ./migrations
EXPOSE 8787
USER node
CMD ["node", "dist/server.js"]
