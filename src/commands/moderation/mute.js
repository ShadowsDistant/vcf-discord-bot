'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

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
