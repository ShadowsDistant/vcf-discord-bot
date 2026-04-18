'use strict';

const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { memberHasAnyRole } = require('../../utils/roles');

const GIVEAWAY_STARTER_ROLE_IDS = new Set([
  '1379199481886802061',
  '1470915962860736553',
]);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Start a giveaway in a selected channel.')
    .setDMPermission(false)
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel where the giveaway should be posted.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true))
    .addStringOption((o) =>
      o
        .setName('prize')
        .setDescription('What is being given away.')
        .setRequired(true))
    .addStringOption((o) =>
      o
        .setName('duration')
        .setDescription('Optional duration text (example: 24 hours).')
        .setRequired(false))
    .addIntegerOption((o) =>
      o
        .setName('winners')
        .setDescription('Number of winners.')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false)),

  async execute(interaction) {
    if (!memberHasAnyRole(interaction.member, GIVEAWAY_STARTER_ROLE_IDS)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have permission to start giveaways.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const targetChannel = interaction.options.getChannel('channel', true);
    const prize = interaction.options.getString('prize', true).trim();
    const duration = interaction.options.getString('duration')?.trim();
    const winners = interaction.options.getInteger('winners') ?? 1;

    const giveawayEmbed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle('🎉 Giveaway Started')
      .setDescription(`React with 🎉 to enter!\n\n**Prize:** ${prize}`)
      .addFields(
        { name: 'Hosted By', value: `${interaction.user}`, inline: true },
        { name: 'Winners', value: String(winners), inline: true },
      )
      .setTimestamp();

    if (duration) {
      giveawayEmbed.addFields({ name: 'Duration', value: duration, inline: true });
    }

    try {
      const giveawayMessage = await targetChannel.send({ embeds: [giveawayEmbed] });
      await giveawayMessage.react('🎉').catch(() => null);

      return interaction.reply({
        embeds: [embeds.success(`Giveaway started in ${targetChannel}.`, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to start giveaway: \`${err.message}\``, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
