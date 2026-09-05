FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json .npmrc ./
ARG NODE_AUTH_TOKEN
ENV NODE_AUTH_TOKEN=$NODE_AUTH_TOKEN
RUN npm install
COPY tsconfig.json tsconfig.base.json ./
COPY src ./src
COPY prisma ./prisma
RUN npx prisma generate && npx nest build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
RUN chown -R node:node /app
USER node
EXPOSE 3003
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma && node dist/main"]
