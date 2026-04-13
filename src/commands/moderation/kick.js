'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');
const analytics = require('../../utils/analytics');
const { sendModerationActionDm, sendModLog } = require('../../utils/moderationNotifications');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) =>
      o.setName('user').setDescription('The member to kick.').setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('reason')
        .setDescription('Reason for the kick. Start typing to see preset reasons.')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(interaction) {
    // Mod-role check (Moderator level required when roles are configured)
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({
        embeds: [embeds.error('That user is not in this server.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!member.kickable) {
      return interaction.reply({
        embeds: [embeds.error('I cannot kick that user. They may have a higher role than me.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({
        embeds: [embeds.error('You cannot kick yourself.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await sendModerationActionDm({
        user: target,
        guild: interaction.guild,
        action: 'Kick',
        reason,
        moderatorTag: interaction.user.tag,
      });
      await member.kick(`${interaction.user.tag}: ${reason}`);
      analytics.recordModAction(interaction.guild.id, 'kick', Date.now());
      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Kick',
        reason,
      });
      return interaction.reply({
        embeds: [
          embeds.modAction({
            action: 'Member Kicked',
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
        embeds: [embeds.error(`Failed to kick: ${err.message}`, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
