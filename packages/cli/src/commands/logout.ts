import { Command } from 'commander'
import { clearConfig } from '../lib/config.js'

export const logoutCommand = new Command('logout')
  .description('Remove stored API key')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    clearConfig()
    if (opts.json) {
      console.log(JSON.stringify({ status: 'ok' }))
    } else {
      console.log('Logged out. API key removed.')
    }
  })
