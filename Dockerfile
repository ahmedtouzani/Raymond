FROM node:24-bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node . .
RUN mkdir -p /app/logs /app/backups && chown -R node:node /app
USER node
RUN npm test
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
