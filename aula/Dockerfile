# Imagen única: compila la web y la sirve desde el servidor de la API.
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production \
    TZ=Europe/Madrid \
    PORT=3000 \
    UPLOADS_DIR=/data/uploads
RUN apk add --no-cache tzdata
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server/ ./
COPY --from=web /app/server/public ./public
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/salud || exit 1
CMD ["node", "src/index.js"]
