'use strict';

require('dotenv').config();

const {
  REST,
  Routes,
  Client,
  GatewayIntentBits,
} = require('discord.js');
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

const DISCORD_TOKEN = normalizeEnvValue(process.env.DISCORD_TOKEN);
const CLIENT_ID = normalizeEnvValue(process.env.CLIENT_ID);
const SNOWFLAKE_REGEX = /^\d{17,20}$/;
const requiredBakeCommandsRaw = normalizeEnvValue(process.env.REQUIRED_BAKE_COMMANDS);
const REQUIRED_BAKE_COMMANDS = requiredBakeCommandsRaw
  ? requiredBakeCommandsRaw
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
  : [];

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('❌  Missing required environment variables: DISCORD_TOKEN, CLIENT_ID');
  process.exit(1);
}

if (!SNOWFLAKE_REGEX.test(CLIENT_ID)) {
  console.error(`❌  CLIENT_ID must be a valid Discord snowflake. Received: "${CLIENT_ID}"`);
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

const registeredCommandNames = new Set(commands.map((command) => command.name));
if (REQUIRED_BAKE_COMMANDS.length > 0) {
  const missingBakeCommands = REQUIRED_BAKE_COMMANDS.filter((name) => !registeredCommandNames.has(name));
  if (missingBakeCommands.length > 0) {
    console.error(
      `❌  Missing required bake command(s): ${missingBakeCommands.map((name) => `/${name}`).join(', ')}`,
    );
    process.exit(1);
  }
}

const rest = new REST().setToken(DISCORD_TOKEN);

async function fetchBotGuilds() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    await client.login(DISCORD_TOKEN);
    await client.guilds.fetch();
    return [...client.guilds.cache.values()].map((guild) => ({
      id: guild.id,
      name: guild.name,
    }));
  } finally {
    client.destroy();
  }
}

async function clearLegacyGuildCommands() {
  console.log('\n🧹  Checking for legacy guild-scoped commands…');

  let guilds = [];
  try {
    guilds = await fetchBotGuilds();
  } catch (err) {
    console.warn(`⚠️  Failed to fetch bot guild list for cleanup: ${err.message}`);
    return;
  }

  if (guilds.length === 0) {
    console.log('ℹ️  No guilds found for cleanup.');
    return;
  }

  let clearedGuilds = 0;
  let removedCommands = 0;
  let failedGuilds = 0;

  for (const guild of guilds) {
    const guildId = guild?.id;
    if (!guildId || !SNOWFLAKE_REGEX.test(guildId)) continue;

    try {
      const guildCommands = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, guildId));
      if (!Array.isArray(guildCommands) || guildCommands.length === 0) continue;

      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: [] });
      clearedGuilds += 1;
      removedCommands += guildCommands.length;
      console.log(`  ↳ Cleared ${guildCommands.length} command(s) from guild ${guild.name || guildId}`);
    } catch (err) {
      failedGuilds += 1;
      console.warn(`  ⚠️  Failed clearing guild ${guild.name || guildId}: ${err.message}`);
    }
  }

  if (clearedGuilds === 0) {
    console.log('ℹ️  No legacy guild-scoped commands found.');
    return;
  }

  console.log(`✅  Cleared ${removedCommands} legacy command(s) across ${clearedGuilds} guild(s).`);
  if (failedGuilds > 0) {
    console.warn(`⚠️  Cleanup failed in ${failedGuilds} guild(s); rerun deploy if stale commands remain.`);
  }
}

(async () => {
  try {
    console.log(`\n🚀  Deploying ${commands.length} application (/) command(s)…`);
    const route = Routes.applicationCommands(CLIENT_ID);
    const data = await rest.put(route, { body: commands });
    console.log('✅  Successfully deployed globally');
    console.log('ℹ️  Global command propagation can take up to 1 hour.');

    console.log(`\n✨  ${data.length} command(s) registered.`);

    try {
      await clearLegacyGuildCommands();
    } catch (cleanupErr) {
      console.warn(`⚠️  Legacy guild command cleanup failed: ${cleanupErr.message}`);
    }
  } catch (err) {
    console.error('❌  Deployment failed:', err);
    process.exit(1);
  }
})();
