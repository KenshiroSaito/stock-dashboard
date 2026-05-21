import { PrismaClient } from '@prisma/client'

// 開発時のホットリロード対応:
// Next.js などの開発サーバーがコードを再読み込みすると、毎回新しい PrismaClient が
// 作られて接続が増えてしまう。globalThis に保存することで防ぐ。
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// 型も一緒にre-exportしておくと、他のパッケージから便利に使える
export * from '@prisma/client'