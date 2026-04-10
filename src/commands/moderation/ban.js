'use strict';

const {
  SlashCommandBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Permanently ban a member from the server.')
    .addUserOption((o) =>
      o.setName('user').setDescription('The user to ban.').setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('reason')
        .setDescription('Reason for the ban. Start typing to see preset reasons.')
        .setAutocomplete(true),
    )
    .addIntegerOption((o) =>
      o
        .setName('delete_days')
        .setDescription('Number of days of messages to delete (0–7).')
        .setMinValue(0)
        .setMaxValue(7),
    ),

  async execute(interaction) {
    // Mod-role check (Senior Mod level required when roles are configured)
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.seniorMod)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (member) {
      if (!member.bannable) {
        return interaction.reply({
          embeds: [embeds.error('I cannot ban that user. They may have a higher role than me.', interaction.guild)],
          ephemeral: true,
        });
      }
      if (member.id === interaction.user.id) {
        return interaction.reply({
          embeds: [embeds.error('You cannot ban yourself.', interaction.guild)],
          ephemeral: true,
        });
      }
    }

    try {
      await interaction.guild.members.ban(target, {
        reason: `${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds: deleteDays * 86400,
      });

      return interaction.reply({
        embeds: [
          embeds.modAction({
            action: 'Member Banned',
            emoji: '',
            target,
            moderator: interaction.user,
            reason,
            guild: interaction.guild,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to ban: ${err.message}`, interaction.guild)],
        ephemeral: true,
      });
    }
  },
};
