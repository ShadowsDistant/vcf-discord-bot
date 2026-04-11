'use strict';

const {
  SlashCommandBuilder, ChannelType, MessageFlags,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a plain-text bot message in the selected channel.')
    .addStringOption((o) =>
      o
        .setName('text')
        .setDescription('Text the bot should send.')
        .setRequired(true))
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Target channel (defaults to current channel).')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.management)) {
      return interaction.reply({
        embeds: [embeds.error('Only management can use this command.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const text = interaction.options.getString('text', true);
    const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!targetChannel || !targetChannel.isTextBased()) {
      return interaction.reply({
        embeds: [embeds.error('Please choose a valid text channel.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await targetChannel.send({ content: text });
      return interaction.reply({
        embeds: [embeds.success(`Sent message in ${targetChannel}.`, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to send message: \`${err.message}\``, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
