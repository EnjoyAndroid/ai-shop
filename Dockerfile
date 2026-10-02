# 构建阶段
FROM node:22-slim AS builder

# 安装 OpenSSL 和必要依赖
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci

# 复制源码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate
RUN ./node_modules/.bin/esbuild prisma/seed.ts --bundle --platform=node --external:@prisma/client --outfile=seed.cjs

# NEXT_PUBLIC_* 必须在构建时传入，运行时配置不会修改前端 bundle
ARG NEXT_PUBLIC_SITE_NAME="AI Shop"
ARG NEXT_PUBLIC_SITE_URL="http://localhost:3000"
ARG NEXT_PUBLIC_CONTACT_EMAIL=""
ENV NEXT_PUBLIC_SITE_NAME=${NEXT_PUBLIC_SITE_NAME}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_CONTACT_EMAIL=${NEXT_PUBLIC_CONTACT_EMAIL}

# 构建应用 - 提供临时 DATABASE_URL 跳过构建时的数据库检查
ENV DATABASE_URL="postgresql://temp:temp@localhost:5432/temp"
RUN npm run build

# 生产阶段
FROM node:22-slim AS runner

# 安装 OpenSSL
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制必要文件
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/seed.cjs ./seed.cjs
COPY --from=builder /app/scripts/prepare-database.mjs ./scripts/prepare-database.mjs
COPY --from=builder /app/LICENSE /app/THIRD_PARTY_NOTICES.md ./
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# 复制 prisma CLI 相关文件（用于数据库迁移）
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 复制 public 静态资源（图标等）
COPY --from=builder /app/public ./public

# 设置权限
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "node scripts/prepare-database.mjs && exec node server.js"]
