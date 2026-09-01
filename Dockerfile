# Production-style image: build SPA then serve API + static assets via backend
FROM node:20-alpine

ARG CACHE_BUST=2026-09-01-ftw-gpu-fix
RUN echo "app build ${CACHE_BUST}"

WORKDIR /app

COPY package.json package-lock.json* ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

RUN npm ci

COPY . .

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 VITE_BASE_PATH=/ VITE_ELITE_SAME_ORIGIN_API=true

RUN npm run build:production

EXPOSE 3001

CMD ["npm", "run", "start", "-w", "backend"]
