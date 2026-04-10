'use strict';

const {
  SlashCommandBuilder,
  ChannelType,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a member to another voice channel.')
    .addUserOption((o) =>
      o.setName('user').setDescription('Member to move.').setRequired(true),
    )
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Destination voice channel.')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildVoice),
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
      const channel = interaction.options.getChannel('channel');
      await member.voice.setChannel(channel, `${interaction.user.tag}: Voice move command`);
      return interaction.reply({
        embeds: [embeds.success(`${target} has been moved to ${channel}.`, interaction.guild)],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Voice action failed: ${err.message}`, interaction.guild)],
        ephemeral: true,
      });
    }
  },
};
