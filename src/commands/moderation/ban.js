'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');
const analytics = require('../../utils/analytics');
const { sendModerationActionDm } = require('../../utils/moderationNotifications');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Permanently ban a member from the server.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
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
        flags: MessageFlags.Ephemeral,
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
          flags: MessageFlags.Ephemeral,
        });
      }
      if (member.id === interaction.user.id) {
        return interaction.reply({
          embeds: [embeds.error('You cannot ban yourself.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    try {
      await sendModerationActionDm({
        user: target,
        guild: interaction.guild,
        action: 'Ban',
        reason,
        moderatorTag: interaction.user.tag,
      });
      await interaction.guild.members.ban(target, {
        reason: `${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds: deleteDays * 86400,
      });
      analytics.recordModAction(interaction.guild.id, 'ban', Date.now());

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
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
