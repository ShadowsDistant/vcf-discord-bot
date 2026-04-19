'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// ─── Validate environment ─────────────────────────────────────────────────────
function normalizeEnvValue(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

const DISCORD_TOKEN = normalizeEnvValue(process.env.DISCORD_TOKEN);
const CLIENT_ID = normalizeEnvValue(process.env.CLIENT_ID);
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Missing required environment variables: DISCORD_TOKEN, CLIENT_ID');
  process.exit(1);
}

// ─── Create client ────────────────────────────────────────────────────────────
// Intents are scoped to only what the bot actually needs.
// Note: GuildBans was merged into GuildModeration in Discord.js v14+, so only
// GuildModeration is listed here to avoid declaring a redundant intent.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel],
  allowedMentions: { parse: ['users'], repliedUser: false },
});

// ─── Load commands ────────────────────────────────────────────────────────────
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandLoadErrors = [];
const loadedCommandFiles = new Map();

function collectCommandFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCommandFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

for (const commandPath of collectCommandFiles(commandsPath)) {
  const file = path.basename(commandPath);
  try {
    const command = require(commandPath);
    if (command.data && command.execute && typeof command.data.name === 'string') {
      if (loadedCommandFiles.has(command.data.name)) {
        const firstFile = loadedCommandFiles.get(command.data.name);
        commandLoadErrors.push({
          file,
          error: `Duplicate command name "${command.data.name}" also defined in ${firstFile}`,
        });
        continue;
      }
      loadedCommandFiles.set(command.data.name, file);
      client.commands.set(command.data.name, command);
      console.log(`  ↳ Loaded command: ${command.data.name}`);
    } else {
      console.warn(`  Skipping ${file}: missing data.name or execute export.`);
    }
  } catch (err) {
    commandLoadErrors.push({ file, error: err.stack || err.message });
  }
}

if (commandLoadErrors.length > 0) {
  for (const { file, error } of commandLoadErrors) {
    console.error(`   • ${file}\n${error}`);
  }
  console.error(`${commandLoadErrors.length} command module(s) failed to load. Exiting.`);
  process.exit(1);
}

// ─── Load events ─────────────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'src', 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  const register = event.once ? client.once.bind(client) : client.on.bind(client);
  register(event.name, (...args) => {
    try {
      const maybePromise = event.execute(...args);
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch((err) => {
          console.error(`Unhandled error in event "${event.name}":`, err);
        });
      }
    } catch (err) {
      console.error(`Synchronous error in event "${event.name}":`, err);
    }
  });
  console.log(`  ↳ Loaded event: ${event.name}`);
}

// ─── Global safety nets ──────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}. Shutting down gracefully...`);
  client.destroy();
  // Give a brief window for in-flight work to flush before exit.
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(DISCORD_TOKEN).catch((err) => {
  console.error('Failed to login to Discord:', err);
  process.exit(1);
});
