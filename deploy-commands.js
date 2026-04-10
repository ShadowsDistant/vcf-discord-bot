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

for (const folder of fs.readdirSync(commandsPath)) {
  const folderPath = path.join(commandsPath, folder);
  if (!fs.statSync(folderPath).isDirectory()) continue;

  for (const file of fs.readdirSync(folderPath).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(folderPath, file));
    if (command.data) {
      commands.push(command.data.toJSON());
      console.log(`  ↳ Registering: /${command.data.name}`);
    }
  }
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
