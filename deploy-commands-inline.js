'use strict';
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
const BASE = '/home/workspace/vcf-discord-bot';

const commands = [];
const commandsPath = path.join(BASE, 'src', 'commands');

function collectCommandFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectCommandFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files;
}

const allFiles = collectCommandFiles(commandsPath);
console.log('Total JS files found:', allFiles.length);

for (const fp of allFiles) {
  try {
    const command = require(fp);
    if (command.data?.name) {
      commands.push(command.data.toJSON());
      console.log('  Loaded:', command.data.name);
    }
  } catch(e) {
    console.error('  Error loading', fp, ':', e.message);
  }
}

console.log('Total commands loaded:', commands.length);

async function deploy() {
  if (GUILD_ID) {
    const result = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Deployed', result.length, 'to guild', GUILD_ID);
  } else {
    const result = await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Deployed', result.length, 'globally');
  }
}
deploy().then(() => process.exit(0)).catch(e => { console.error('Deploy error:', e.message); process.exit(1); });
