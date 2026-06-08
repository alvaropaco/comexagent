# Local/dev image for the web app (Vite build served by Express via tsx).
# No package-lock.json in this dir (monorepo root holds the lockfile), so
# `npm install` is used instead of `npm ci`.

FROM node:22-slim
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# server.ts is TypeScript; run it through tsx (installed as a devDependency).
CMD ["npx", "tsx", "server.ts"]
