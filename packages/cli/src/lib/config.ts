import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface ApiexConfig {
  apiKey?: string
  baseUrl?: string
}

const CONFIG_DIR = join(homedir(), '.apiex')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export function getConfigPath(): string {
  return CONFIG_FILE
}

export function readConfig(): ApiexConfig {
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(raw) as ApiexConfig
  } catch {
    return {}
  }
}

export function writeConfig(config: ApiexConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

export function clearConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE)
  }
}

export function getApiKey(): string {
  const envKey = process.env['APIEX_API_KEY']
  if (envKey) return envKey
  const config = readConfig()
  if (config.apiKey) return config.apiKey
  throw new Error('No API key found. Run `apiex login` or set APIEX_API_KEY env var.')
}

export function getBaseUrl(): string {
  const envUrl = process.env['APIEX_BASE_URL']
  if (envUrl) return envUrl
  const config = readConfig()
  if (config.baseUrl) return config.baseUrl
  return 'http://localhost:3000'
}
