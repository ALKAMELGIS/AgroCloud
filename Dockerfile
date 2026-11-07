# Production-style image: build SPA then serve API + static assets via backend
FROM node:22-alpine

ARG CACHE_BUST=2026-09-01-ftw-argv-fix
RUN echo "app build ${CACHE_BUST}"

WORKDIR /app

COPY package.json package-lock.json* ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

# better-sqlite3 (the SQLite driver) is a native module: prebuilt binaries are used when available,
# the toolchain is only a fallback for compiling it and is removed again after install.
RUN apk add --no-cache --virtual .native-build python3 make g++ \
 && npm ci \
 && apk del .native-build

COPY . .

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 VITE_BASE_PATH=/ VITE_ELITE_SAME_ORIGIN_API=true
# SQLite database + imported JSON stores. Mount a volume here so data survives rebuilds.
ENV AGROCLOUD_DATA_DIR=/var/lib/agrocloud
VOLUME /var/lib/agrocloud

RUN npm run build:production

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "backend"]
