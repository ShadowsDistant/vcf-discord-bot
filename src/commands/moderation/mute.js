'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');
const { sendCommandLog, sendModLog } = require('../../utils/moderationNotifications');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Server mute a member in voice.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers)
    .addUserOption((o) =>
      o.setName('user').setDescription('Member to mute.').setRequired(true),
    ),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({
        embeds: [embeds.error('That user is not in this server.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!member.voice?.channelId) {
      return interaction.reply({
        embeds: [embeds.error('That user is not connected to a voice channel.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await member.voice.setMute(true, `${interaction.user.tag}: Voice mute command`);
      await sendModLog({
        guild: interaction.guild,
        target,
        moderator: interaction.user,
        action: 'Mute',
        reason: 'Voice mute',
      });
      await sendCommandLog({
        guild: interaction.guild,
        moderator: interaction.user,
        action: 'Server Mute',
        target: `${target.tag} (${target.id})`,
        details: 'Server-muted in voice channel.',
      });
      return interaction.reply({
        embeds: [embeds.success(`${target} has been server-muted.`, interaction.guild)],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Voice action failed: ${err.message}`, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
