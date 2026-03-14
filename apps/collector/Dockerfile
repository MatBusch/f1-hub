FROM node:20-slim

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tinybird.config.mjs ./
COPY apps/collector/package.json apps/collector/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/data/package.json packages/data/package.json

RUN pnpm install --frozen-lockfile

COPY apps/collector apps/collector
COPY packages/contracts packages/contracts
COPY packages/data packages/data
COPY lib lib

CMD ["pnpm", "--filter", "@f1-hub/collector", "start:ingest"]
