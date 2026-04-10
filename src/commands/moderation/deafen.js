'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deafen')
    .setDescription('Server deafen a member in voice.')
    .setDefaultMemberPermissions(PermissionFlagsBits.DeafenMembers)
    .addUserOption((o) =>
      o.setName('user').setDescription('Member to deafen.').setRequired(true),
    ),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({
        embeds: [embeds.error('That user is not in this server.', interaction.guild)],
        ephemeral: true,
      });
    }

    if (!member.voice?.channelId) {
      return interaction.reply({
        embeds: [embeds.error('That user is not connected to a voice channel.', interaction.guild)],
        ephemeral: true,
      });
    }

    try {
      await member.voice.setDeaf(true, `${interaction.user.tag}: Voice deafen command`);
      return interaction.reply({
        embeds: [embeds.success(`${target} has been server-deafened.`, interaction.guild)],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Voice action failed: ${err.message}`, interaction.guild)],
        ephemeral: true,
      });
    }
  },
};
