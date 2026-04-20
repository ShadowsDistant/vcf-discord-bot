'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const embeds = require('../../utils/embeds');
const { canUseDevCommand } = require('../../utils/roles');

const COMMANDS_ROOT = path.join(__dirname, '..');

/**
 * Find the absolute path of the command file whose module exports `data.name === commandName`.
 * Falls back to scanning the commands tree so nested categories are covered.
 * @param {string} commandName
 * @returns {string|null}
 */
function findCommandFile(commandName) {
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const hit = walk(full);
        if (hit) return hit;
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        try {
          const mod = require.cache[require.resolve(full)]?.exports ?? require(full);
          if (mod?.data?.name === commandName) return full;
        } catch {
          // ignore load errors during scan
        }
      }
    }
    return null;
  }
  return walk(COMMANDS_ROOT);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('[Dev] Reload a single command without restarting the bot.')
    .addStringOption((opt) => opt
      .setName('command')
      .setDescription('The command name (without the leading slash).')
      .setRequired(true)),

  async execute(interaction) {
    if (!canUseDevCommand(interaction.member, interaction.guild, 'reload')) {
      return interaction.reply({
        embeds: [embeds.error('This command requires an allowed developer user ID.', interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const commandName = interaction.options.getString('command', true).toLowerCase().trim();
    const existing = interaction.client.commands.get(commandName);

    if (!existing) {
      return interaction.reply({
        embeds: [embeds.error(`There is no command named \`/${commandName}\`.`, interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const filePath = findCommandFile(commandName);
    if (!filePath) {
      return interaction.reply({
        embeds: [embeds.error(`Could not locate the source file for \`/${commandName}\`.`, interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      delete require.cache[require.resolve(filePath)];
      const reloaded = require(filePath);
      if (!reloaded?.data || !reloaded?.execute) {
        throw new Error('Reloaded module is missing data or execute export.');
      }
      interaction.client.commands.set(reloaded.data.name, reloaded);

      return interaction.reply({
        embeds: [
          embeds
            .dev(`🔁 Reloaded /${reloaded.data.name}`, `Source reloaded from \`${path.relative(path.join(__dirname, '..', '..', '..'), filePath)}\`.`, interaction.guild ?? null)
            .addFields({
              name: 'Note',
              value: 'Handler logic is live immediately. Slash-command metadata changes still require `/refresh` (Discord side).',
              inline: false,
            }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      console.error('[/reload] failed:', err);
      return interaction.reply({
        embeds: [embeds.error(`Reload failed for \`/${commandName}\`:\n\`${err.message}\``, interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
