# Production-style image: build SPA then serve API + static assets via backend
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

RUN npm ci

COPY . .

ENV NODE_ENV=production HOST=0.0.0.0 VITE_BASE_PATH=/

RUN npm run build:production

EXPOSE 3000

CMD ["npm", "run", "start", "-w", "backend"]
