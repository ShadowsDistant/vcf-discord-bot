'use strict';

require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('❌  Missing required environment variables: DISCORD_TOKEN, CLIENT_ID');
  process.exit(1);
}

const commands = [];
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
      commands.push(command.data.toJSON());
      console.log(`  ↳ Registering: /${command.data.name}`);
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
  console.error(`❌  ${commandLoadErrors.length} command module(s) failed to load. Aborting deployment.`);
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\n🚀  Deploying ${commands.length} application (/) command(s)…`);

    let data;
    if (GUILD_ID) {
      // Guild-scoped deploy (instant, for testing)
      data = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: commands,
      });
      console.log(`✅  Successfully deployed to guild ${GUILD_ID}`);
    } else {
      // Global deploy (takes up to 1 hour to propagate)
      data = await rest.put(Routes.applicationCommands(CLIENT_ID), {
        body: commands,
      });
      console.log('✅  Successfully deployed globally');
    }

    console.log(`\n✨  ${data.length} command(s) registered.`);
  } catch (err) {
    console.error('❌  Deployment failed:', err);
  }
})();
