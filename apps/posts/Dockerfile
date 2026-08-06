FROM node:22-alpine AS builder

ARG service

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build:${service}
RUN pnpm prune --prod

FROM node:22-alpine

ARG port
ARG service

ENV NODE_ENV=production
ENV SERVICE=$service
ENV PORT=$port

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

USER node

EXPOSE ${PORT}

CMD ["sh", "-c", "node dist/apps/${SERVICE}/apps/${SERVICE}/src/main.js"]
