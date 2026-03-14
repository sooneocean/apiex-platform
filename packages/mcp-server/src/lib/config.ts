import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

interface ApiexConfig {
  apiKey?: string
  baseUrl?: string
}

const CONFIG_FILE = join(homedir(), '.apiex', 'config.json')

function readConfig(): ApiexConfig {
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(raw) as ApiexConfig
  } catch {
    return {}
  }
}

export function getApiKey(): string {
  const envKey = process.env['APIEX_API_KEY']
  if (envKey) return envKey
  const config = readConfig()
  if (config.apiKey) return config.apiKey
  throw new Error('No API key found. Set APIEX_API_KEY env var or run `apiex login`.')
}

export function getBaseUrl(): string {
  const envUrl = process.env['APIEX_BASE_URL']
  if (envUrl) return envUrl
  const config = readConfig()
  if (config.baseUrl) return config.baseUrl
  return 'http://localhost:3000'
}
