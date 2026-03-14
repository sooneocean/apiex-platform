import { createInterface } from 'node:readline'
import { writeConfig, readConfig, getBaseUrl } from '../lib/config.js'

export async function loginAction(opts: { json?: boolean }): Promise<void> {
  const baseUrl = getBaseUrl()
  const adminUrl = `${baseUrl}/admin`

  if (opts.json) {
    console.log(JSON.stringify({ action: 'login', adminUrl }))
  } else {
    console.log(`\nOpen the Admin Web UI to get your API Key:`)
    console.log(`  ${adminUrl}\n`)
    console.log(`Copy your API Key and paste it below.\n`)
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const apiKey = await new Promise<string>((resolve) => {
    rl.question('API Key: ', (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })

  if (!apiKey) {
    console.error('No API Key provided. Aborting.')
    process.exit(1)
  }

  const config = readConfig()
  config.apiKey = apiKey
  writeConfig(config)

  if (opts.json) {
    console.log(JSON.stringify({ status: 'ok', message: 'API Key saved' }))
  } else {
    console.log('API Key saved to ~/.apiex/config.json')
  }
}

export async function logoutAction(opts: { json?: boolean }): Promise<void> {
  const { clearConfig } = await import('../lib/config.js')
  clearConfig()

  if (opts.json) {
    console.log(JSON.stringify({ status: 'ok', message: 'Logged out' }))
  } else {
    console.log('Logged out. Config cleared.')
  }
}
