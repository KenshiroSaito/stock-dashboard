import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { prisma } from '@stock-dashboard/database'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

// DB接続テスト用エンドポイント
app.get('/health/db', async (c) => {
  try {
    // 簡単なクエリでDB接続を確認
    const userCount = await prisma.user.count()
    return c.json({
      status: 'ok',
      database: 'connected',
      userCount,
    })
  } catch (error) {
    return c.json({
      status: 'error',
      database: 'disconnected',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500)
  }
})

serve({
  fetch: app.fetch,
  port: 8080
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
