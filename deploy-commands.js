'use strict';

require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

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

function parseBooleanEnv(value) {
  const normalized = normalizeEnvValue(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

const DISCORD_TOKEN = normalizeEnvValue(process.env.DISCORD_TOKEN);
const CLIENT_ID = normalizeEnvValue(process.env.CLIENT_ID);
const rawGuildId = normalizeEnvValue(process.env.GUILD_ID);
const GUILD_ID = rawGuildId || null;
const CLEAR_GLOBAL_DUPLICATES = parseBooleanEnv(process.env.CLEAR_GLOBAL_DUPLICATES);
const SNOWFLAKE_REGEX = /^\d{17,20}$/;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('❌  Missing required environment variables: DISCORD_TOKEN, CLIENT_ID');
  process.exit(1);
}

if (!SNOWFLAKE_REGEX.test(CLIENT_ID)) {
  console.error(`❌  CLIENT_ID must be a valid Discord snowflake. Received: "${CLIENT_ID}"`);
  process.exit(1);
}

if (GUILD_ID && !SNOWFLAKE_REGEX.test(GUILD_ID)) {
  console.error(`❌  GUILD_ID must be a valid Discord snowflake when set. Received: "${GUILD_ID}"`);
  process.exit(1);
}

const commands = [];
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
      commands.push(command.data.toJSON());
      console.log(`  ↳ Registering: /${command.data.name}`);
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
      console.log('ℹ️  Global command propagation can take up to 1 hour.');
    }

    if (GUILD_ID) {
      const globalRoute = Routes.applicationCommands(CLIENT_ID);
      const globalData = await rest.get(globalRoute);
      const globalByName = new Map(globalData.map((command) => [command.name, command]));
      const localCommandNames = new Set(commands.map((command) => command.name));
      const overlap = data
        .filter((guildCommand) => globalByName.has(guildCommand.name))
        .map((guildCommand) => guildCommand.name);
      const staleGlobals = globalData
        .filter((globalCommand) => !localCommandNames.has(globalCommand.name))
        .map((globalCommand) => globalCommand.name);

      if (overlap.length > 0) {
        console.warn(
          `⚠  ${overlap.length} command(s) exist in both guild and global scope: ${overlap.join(', ')}`,
        );
        console.warn(
          '   These can appear as duplicate slash commands in Discord until global commands are removed.',
        );
      }

      if (staleGlobals.length > 0) {
        console.warn(
          `⚠  ${staleGlobals.length} stale global command(s) are not in this codebase: ${staleGlobals.join(', ')}`,
        );
        console.warn(
          '   These stale global commands can still appear in Discord when testing with guild commands.',
        );
      }

      if (CLEAR_GLOBAL_DUPLICATES) {
        const removableGlobalCommands = globalData.filter((globalCommand) => (
          overlap.includes(globalCommand.name) || !localCommandNames.has(globalCommand.name)
        ));

        let removed = 0;
        for (const globalCommand of removableGlobalCommands) {
          if (!globalCommand.id) continue;
          try {
            await rest.delete(`${globalRoute}/${globalCommand.id}`);
            removed += 1;
            console.log(`  ↳ Removed global command: /${globalCommand.name}`);
          } catch (deleteErr) {
            console.error(`  ✗ Failed to remove global /${globalCommand.name}: ${deleteErr.message}`);
          }
        }

        if (removed > 0) {
          console.log(`✅  Removed ${removed} global command(s) (duplicates and stale entries).`);
        }
      } else if (staleGlobals.length > 0) {
        console.log(
          'ℹ️  Set CLEAR_GLOBAL_DUPLICATES=true to remove overlapping and stale global commands.',
        );
      }
    }

    console.log(`\n✨  ${data.length} command(s) registered.`);
  } catch (err) {
    console.error('❌  Deployment failed:', err);
  }
})();
