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
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
# Der Migrations-Runner liest ../../migrations/ relativ zu dist/db/ –
# ohne den Ordner crasht der Start.
COPY migrations ./migrations
EXPOSE 8787
CMD ["node", "dist/server.js"]
