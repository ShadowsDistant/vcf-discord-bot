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
  }
}

if (commandLoadErrors.length > 0) {
  for (const { file, error } of commandLoadErrors) {
    console.error(`   • ${file}\n${error}`);
  }
  console.error(`❌  ${commandLoadErrors.length} command module(s) failed to load. Aborting deployment.`);
  process.exit(1);
}

const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\n🚀  Deploying ${commands.length} application (/) command(s)…`);

    let data;
    let route;
    if (GUILD_ID) {
      // Guild-scoped deploy (instant, for testing)
      route = Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID);
      data = await rest.put(route, {
        body: commands,
      });
      console.log(`✅  Successfully deployed to guild ${GUILD_ID}`);
    } else {
      // Global deploy (takes up to 1 hour to propagate)
      route = Routes.applicationCommands(CLIENT_ID);
      data = await rest.put(route, {
        body: commands,
      });
      console.log('✅  Successfully deployed globally');
    }

    const expected = new Set(commands.map((c) => c.name));
    const returned = new Set(data.map((c) => c.name));
    const missing = [...expected].filter((name) => !returned.has(name));
    if (missing.length > 0) {
      console.warn(`⚠  ${missing.length} command(s) missing after bulk deploy: ${missing.join(', ')}`);
      for (const command of commands.filter((c) => missing.includes(c.name))) {
        try {
          await rest.post(route, { body: command });
          console.log(`  ↳ Re-registered missing command: /${command.name}`);
        } catch (err) {
          console.error(`  ✗ Failed to re-register /${command.name}: ${err.message}`);
        }
      }
    }

    console.log(`\n✨  ${data.length} command(s) registered.`);
  } catch (err) {
    console.error('❌  Deployment failed:', err);
  }
})();
