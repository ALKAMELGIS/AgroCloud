# Production-style image: build SPA then serve API + static assets via backend
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/

RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV VITE_BASE_PATH=/AgroCloud/
RUN npm run build:production

EXPOSE 3001

CMD ["npm", "start"]
