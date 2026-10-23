FROM node:24.22.1-slim AS base
# The arm64 build runs under emulation; the npm registry occasionally resets connections, so retry more often
ENV npm_config_fetch_retries=6 \
    npm_config_fetch_retry_mintimeout=5000 \
    npm_config_fetch_retry_maxtimeout=60000
RUN npm install --global pnpm@12.15.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM base AS deps
RUN pnpm install --frozen-lockfile --prod

FROM node:24.22.1-slim
RUN apt-get update \
    && apt-get install --yes --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    # GitLab runners mount the checkout with a different owner than the container user
    && git config --system --add safe.directory '*'

WORKDIR /opt/relwolf
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN chmod +x dist/cli.js && ln -s /opt/relwolf/dist/cli.js /usr/local/bin/relwolf

# No ENTRYPOINT on purpose: GitLab CI overrides it for `image:` anyway, so `relwolf` is simply on the PATH.
CMD ["relwolf"]
