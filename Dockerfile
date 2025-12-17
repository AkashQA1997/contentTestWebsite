FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# Install deps first (better caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy app source
COPY server.js ./
COPY root ./root

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]


