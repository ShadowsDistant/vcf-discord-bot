'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  SlashCommandBuilder,
  MessageFlags,
  REST,
  Routes,
  Collection,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { canUseDevCommand } = require('../../utils/roles');

const COMMANDS_ROOT = path.join(__dirname, '..');

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

function reloadCommandModules(client) {
  const commandFiles = collectCommandFiles(COMMANDS_ROOT);
  const nextCollection = new Collection();
  const registeredBodies = [];
  const loadErrors = [];

  for (const filePath of commandFiles) {
    try {
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);
      if (command?.data && typeof command.execute === 'function' && typeof command.data.name === 'string') {
        if (nextCollection.has(command.data.name)) {
          loadErrors.push(`${path.basename(filePath)}: duplicate name "${command.data.name}"`);
          continue;
        }
        nextCollection.set(command.data.name, command);
        registeredBodies.push(command.data.toJSON());
      }
    } catch (err) {
      loadErrors.push(`${path.basename(filePath)}: ${err.message}`);
    }
  }

  client.commands = nextCollection;
  return { commandBodies: registeredBodies, loadErrors };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('[Dev] Hot-reload command modules and re-register slash commands with Discord.')
    .addStringOption((option) => option
      .setName('scope')
      .setDescription('Where to deploy the refreshed commands.')
      .addChoices(
        { name: 'Auto (use GUILD_ID if set, otherwise global)', value: 'auto' },
        { name: 'This guild only (instant)', value: 'guild' },
        { name: 'Global (up to 1 hour to propagate)', value: 'global' },
      )),

  async execute(interaction) {
    if (!canUseDevCommand(interaction.member, interaction.guild, 'refresh')) {
      return interaction.reply({
        embeds: [embeds.error('This command requires an allowed developer user ID.', interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    if (!token || !clientId) {
      return interaction.editReply({
        embeds: [embeds.error('Missing DISCORD_TOKEN or CLIENT_ID in environment.', interaction.guild ?? null)],
      });
    }

    const scope = interaction.options.getString('scope') ?? 'auto';
    const envGuildId = process.env.GUILD_ID?.trim();
    let guildIdForDeploy = null;
    if (scope === 'guild') {
      guildIdForDeploy = interaction.guildId;
    } else if (scope === 'global') {
      guildIdForDeploy = null;
    } else if (envGuildId && /^\d{17,20}$/.test(envGuildId)) {
      guildIdForDeploy = envGuildId;
    }

    const startedAt = Date.now();
    const { commandBodies, loadErrors } = reloadCommandModules(interaction.client);

    if (loadErrors.length > 0) {
      return interaction.editReply({
        embeds: [embeds.error(
          `Failed to load ${loadErrors.length} command module(s):\n\`\`\`\n${loadErrors.slice(0, 15).join('\n').slice(0, 3500)}\n\`\`\``,
          interaction.guild ?? null,
        )],
      });
    }

    const rest = new REST({ version: '10' }).setToken(token);
    let deployed;
    try {
      const route = guildIdForDeploy
        ? Routes.applicationGuildCommands(clientId, guildIdForDeploy)
        : Routes.applicationCommands(clientId);
      deployed = await rest.put(route, { body: commandBodies });
    } catch (err) {
      return interaction.editReply({
        embeds: [embeds.error(`Deployment failed: ${err.message ?? err}`, interaction.guild ?? null)],
      });
    }

    const elapsedMs = Date.now() - startedAt;
    const scopeLabel = guildIdForDeploy ? `guild \`${guildIdForDeploy}\`` : 'global (up to 1 hour propagation)';

    return interaction.editReply({
      embeds: [embeds.dev(
        'Commands Refreshed',
        [
          `**Modules reloaded:** \`${interaction.client.commands.size}\``,
          `**Commands deployed:** \`${Array.isArray(deployed) ? deployed.length : commandBodies.length}\``,
          `**Scope:** ${scopeLabel}`,
          `**Time:** \`${(elapsedMs / 1000).toFixed(2)} s\``,
        ].join('\n'),
        interaction.guild ?? null,
      )],
    });
  },
};
