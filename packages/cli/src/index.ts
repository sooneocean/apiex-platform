#!/usr/bin/env node
import { Command } from 'commander'
import { loginAction, logoutAction } from './commands/login.js'
import { keysListAction, keysCreateAction, keysRevokeAction } from './commands/keys.js'
import { chatAction } from './commands/chat.js'
import { statusAction } from './commands/status.js'

const program = new Command()

program
  .name('apiex')
  .description('Apiex Platform CLI')
  .version('0.1.0')

// login
program
  .command('login')
  .description('Authenticate with Apiex (opens Admin UI URL)')
  .option('--json', 'Output as JSON')
  .action(loginAction)

// logout
program
  .command('logout')
  .description('Clear stored credentials')
  .option('--json', 'Output as JSON')
  .action(logoutAction)

// keys
const keys = program
  .command('keys')
  .description('Manage API keys')

keys
  .command('list')
  .description('List all API keys')
  .option('--json', 'Output as JSON')
  .action(keysListAction)

keys
  .command('create')
  .description('Create a new API key')
  .requiredOption('--name <name>', 'Key name')
  .option('--json', 'Output as JSON')
  .action(keysCreateAction)

keys
  .command('revoke <key-id>')
  .description('Revoke an API key')
  .option('--json', 'Output as JSON')
  .action(keysRevokeAction)

// chat
program
  .command('chat <prompt>')
  .description('Send a chat completion request')
  .requiredOption('--model <model>', 'Model tag (e.g. apex-smart, apex-cheap)')
  .option('--json', 'Output as JSON')
  .action(chatAction)

// status
program
  .command('status')
  .description('Show available models and usage summary')
  .option('--json', 'Output as JSON')
  .action(statusAction)

program.parse()
