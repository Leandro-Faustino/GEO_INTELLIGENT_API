FROM node:25-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm ci --omit=dev --ignore-scripts

FROM node:25-alpine AS release

RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV HOME=/home/app
ENV APP_HOME=$HOME/node
WORKDIR $APP_HOME

COPY --chown=node:node --from=builder /build/node_modules ./node_modules
COPY --chown=node:node --from=builder /build/dist ./dist
COPY --chown=node:node package.json ./

USER node

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
