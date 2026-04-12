'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { patchInteractionDisplayComponents } = require('./src/utils/displayComponents');

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
  console.error('❌  Missing required environment variables: DISCORD_TOKEN, CLIENT_ID');
  process.exit(1);
}

// ─── Create client ────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration,
  ],
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
      console.warn(`  ⚠  Skipping ${file}: missing data.name or execute export.`);
    }
  } catch (err) {
    commandLoadErrors.push({ file, error: err.stack || err.message });
  }
}

if (commandLoadErrors.length > 0) {
  for (const { file, error } of commandLoadErrors) {
    console.error(`   • ${file}\n${error}`);
  }
  console.error(`❌  ${commandLoadErrors.length} command module(s) failed to load. Exiting.`);
  process.exit(1);
}

// ─── Load events ─────────────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'src', 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => {
      if (event.name === 'interactionCreate' && args[0]) patchInteractionDisplayComponents(args[0]);
      return event.execute(...args);
    });
  } else {
    client.on(event.name, (...args) => {
      if (event.name === 'interactionCreate' && args[0]) patchInteractionDisplayComponents(args[0]);
      return event.execute(...args);
    });
  }
  console.log(`  ↳ Loaded event: ${event.name}`);
}

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(DISCORD_TOKEN).catch((err) => {
  console.error('❌  Failed to login to Discord:', err);
  process.exit(1);
});
