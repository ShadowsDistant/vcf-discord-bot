'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription("Clear all warnings for a member.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName('user').setDescription('The member to clear warnings for.').setRequired(true),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const existing = db.getWarnings(interaction.guild.id, target.id);

    if (existing.length === 0) {
      return interaction.reply({
        embeds: [embeds.warning(`**${target.tag}** has no warnings to clear.`, interaction.guild)],
        ephemeral: true,
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
