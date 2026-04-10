'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─── Validate environment ─────────────────────────────────────────────────────
const { DISCORD_TOKEN, CLIENT_ID } = process.env;
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
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      console.log(`  ↳ Loaded command: ${command.data.name}`);
    } else {
      console.warn(`  ⚠  Skipping ${file}: missing data or execute export.`);
    }
  } catch (err) {
    commandLoadErrors.push({ file, error: err.stack || err.message });
    console.warn(`  ⚠  Skipping ${file}: failed to load command module.`);
    console.warn(`     ${err.stack || err.message}`);
  }
}

if (commandLoadErrors.length > 0) {
  console.error(`❌  ${commandLoadErrors.length} command module(s) failed to load. Exiting.`);
  process.exit(1);
}

// ─── Load events ─────────────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'src', 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  console.log(`  ↳ Loaded event: ${event.name}`);
}

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(DISCORD_TOKEN);
