FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY scripts ./scripts

VOLUME ["/data"]

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
