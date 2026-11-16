FROM oven/bun:1-alpine AS runner
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy application source
COPY . .

# Build production React frontend bundle
RUN bun run build:frontend

# Create data directory for SQLite
RUN mkdir -p data

EXPOSE 3000

ENV APP_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["bun", "run", "index.ts"]
