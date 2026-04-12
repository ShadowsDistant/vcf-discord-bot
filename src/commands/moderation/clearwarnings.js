'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription("Clear all warnings for a member.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((o) =>
      o.setName('user').setDescription('The member to clear warnings for.').setRequired(true),
    ),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = interaction.options.getUser('user');
    const existing = db.getWarnings(interaction.guild.id, target.id);

    if (existing.length === 0) {
      return interaction.reply({
        embeds: [embeds.warning(`**${target.tag}** has no warnings to clear.`, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    db.clearWarnings(interaction.guild.id, target.id);

    return interaction.reply({
      embeds: [
        embeds.success(
          `Cleared **${existing.length}** warning${existing.length !== 1 ? 's' : ''} for **${target.tag}**.`,
          interaction.guild,
        ),
      ],
    });
  },
};
