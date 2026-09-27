# Rhubarb on a private server. See scripts/run-hosted.sh for the environment it needs.
FROM node:24-bookworm-slim

# better-sqlite3 ships prebuilt binaries for this platform; python3/make/g++ are only a fallback for building it.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 make g++ tini \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @beeai/cli@0.7.3

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/daemon/package.json packages/daemon/
COPY packages/dashboard/package.json packages/dashboard/
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production RHUBARB_HOME=/data PORT=4242
VOLUME ["/data"]
EXPOSE 4242
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash", "scripts/run-hosted.sh"]
