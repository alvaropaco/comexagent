# Local/dev image for the NestJS core-data-api.
# Uses `npm install` (not `npm ci`): the lockfile now lives at the monorepo
# root, so this app dir has no package-lock.json of its own.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 8080
CMD ["node", "dist/main"]
