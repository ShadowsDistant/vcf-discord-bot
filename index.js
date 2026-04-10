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

for (const folder of fs.readdirSync(commandsPath)) {
  const folderPath = path.join(commandsPath, folder);
  if (!fs.statSync(folderPath).isDirectory()) continue;

  for (const file of fs.readdirSync(folderPath).filter((f) => f.endsWith('.js'))) {
    const commandPath = path.join(folderPath, file);
    try {
      const command = require(commandPath);
      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        console.log(`  ↳ Loaded command: ${command.data.name}`);
      } else {
        console.warn(`  ⚠  Skipping ${file}: missing data or execute export.`);
      }
    } catch (err) {
      console.warn(`  ⚠  Skipping ${file}: failed to load command module.`);
      console.warn(`     ${err.message}`);
    }
  }
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
