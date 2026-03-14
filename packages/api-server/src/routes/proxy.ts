import { Hono } from 'hono'

export function proxyRoutes() {
  const router = new Hono()

  router.post('/chat/completions', async (c) => {
    return c.json({ error: { message: 'Not implemented', type: 'server_error', code: 'not_implemented' } }, 501)
  })

  router.get('/models', async (c) => {
    return c.json({ error: { message: 'Not implemented', type: 'server_error', code: 'not_implemented' } }, 501)
  })

  router.get('/usage/summary', async (c) => {
    return c.json({ error: { message: 'Not implemented', type: 'server_error', code: 'not_implemented' } }, 501)
  })

  return router
}
