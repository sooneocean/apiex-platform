import { apiRequest } from '../lib/api.js'

interface ApiKey {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt?: string
}

interface CreateKeyResponse {
  id: string
  name: string
  key: string
}

export async function keysListAction(opts: { json?: boolean }): Promise<void> {
  const res = await apiRequest<{ keys: ApiKey[] }>('GET', '/keys')

  if (!res.ok) {
    console.error(`Error: ${res.status}`)
    if (opts.json) console.log(JSON.stringify(res.data))
    process.exit(1)
  }

  const keys = res.data.keys ?? []

  if (opts.json) {
    console.log(JSON.stringify(keys, null, 2))
    return
  }

  if (keys.length === 0) {
    console.log('No API keys found.')
    return
  }

  console.log('ID\t\tName\t\tPrefix\t\tCreated')
  console.log('─'.repeat(60))
  for (const k of keys) {
    console.log(`${k.id}\t${k.name}\t${k.prefix}...\t${k.createdAt}`)
  }
}

export async function keysCreateAction(
  opts: { name: string; json?: boolean }
): Promise<void> {
  const res = await apiRequest<CreateKeyResponse>('POST', '/keys', {
    name: opts.name,
  })

  if (!res.ok) {
    console.error(`Error: ${res.status}`)
    if (opts.json) console.log(JSON.stringify(res.data))
    process.exit(1)
  }

  if (opts.json) {
    console.log(JSON.stringify(res.data, null, 2))
  } else {
    console.log(`Key created: ${res.data.key}`)
    console.log(`(Save this key — it won't be shown again)`)
  }
}

export async function keysRevokeAction(
  keyId: string,
  opts: { json?: boolean }
): Promise<void> {
  const res = await apiRequest('DELETE', `/keys/${keyId}`)

  if (!res.ok) {
    console.error(`Error: ${res.status}`)
    if (opts.json) console.log(JSON.stringify(res.data))
    process.exit(1)
  }

  if (opts.json) {
    console.log(JSON.stringify({ status: 'ok', id: keyId }))
  } else {
    console.log(`Key ${keyId} revoked.`)
  }
}
