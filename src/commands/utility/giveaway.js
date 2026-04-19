'use strict';

const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { memberHasAnyRole } = require('../../utils/roles');
const giveawayUtils = require('../../utils/giveaways');

const GIVEAWAY_STARTER_ROLE_IDS = new Set([
  '1379199481886802061',
  '1470915962860736553',
]);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create and manage giveaways.')
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('Start a giveaway in a selected channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel where the giveaway should be posted.')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true))
        .addStringOption((option) =>
          option
            .setName('prize')
            .setDescription('What is being given away.')
            .setRequired(true))
        .addStringOption((option) =>
          option
            .setName('duration')
            .setDescription('Duration (examples: 30m, 2h, 1d, 1h30m).')
            .setRequired(true))
        .addIntegerOption((option) =>
          option
            .setName('winners')
            .setDescription('Number of winners.')
            .setMinValue(1)
            .setMaxValue(20)
            .setRequired(false)))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('end')
        .setDescription('End the oldest active giveaway in this channel.'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reroll')
        .setDescription('Reroll the oldest ended giveaway in this channel.')),

  async execute(interaction) {
    if (!memberHasAnyRole(interaction.member, GIVEAWAY_STARTER_ROLE_IDS)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have permission to manage giveaways.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'start') {
      const targetChannel = interaction.options.getChannel('channel', true);
      const prize = interaction.options.getString('prize', true).trim();
      const durationText = interaction.options.getString('duration', true).trim();
      const durationMs = giveawayUtils.parseDurationMs(durationText);
      const winners = interaction.options.getInteger('winners') ?? 1;
      if (!durationMs || durationMs < 10_000) {
        return interaction.reply({
          embeds: [embeds.error('Invalid duration. Use values like `30m`, `2h`, or `1h30m` (minimum 10 seconds).', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      const now = Date.now();
      const endsAt = now + durationMs;
      const giveawayEmbed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('Giveaway Started')
        .setDescription(`React to enter.\n\n**Prize:** ${prize}`)
        .addFields(
          { name: 'Hosted By', value: `${interaction.user}`, inline: true },
          { name: 'Winners', value: String(winners), inline: true },
          { name: 'Duration', value: durationText, inline: true },
          { name: 'Ends', value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
        )
        .setTimestamp();

      try {
        const giveawayMessage = await targetChannel.send({ embeds: [giveawayEmbed] });
        await giveawayMessage.react(giveawayUtils.GIVEAWAY_REACTION).catch(() => null);
        giveawayUtils.createGiveawayRecord(
          interaction.guild.id,
          targetChannel.id,
          giveawayMessage.id,
          interaction.user.id,
          prize,
          winners,
          endsAt,
        );

        return interaction.reply({
          embeds: [embeds.success(`Giveaway started in ${targetChannel}. Ends <t:${Math.floor(endsAt / 1000)}:R>.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      } catch (err) {
        return interaction.reply({
          embeds: [embeds.error(`Failed to start giveaway: \`${err.message}\``, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (subcommand === 'end') {
      const record = giveawayUtils.getOldestActiveGiveaway(interaction.guild.id, interaction.channelId);
      if (!record) {
        return interaction.reply({
          embeds: [embeds.warning('No active giveaways were found in this channel.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      const result = await giveawayUtils.concludeGiveawayRecord(interaction.guild, record, `${interaction.user.tag} (manual)`);
      if (!result.ok) {
        return interaction.reply({
          embeds: [embeds.error(result.reason, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.reply({
        embeds: [embeds.success(`Ended giveaway and picked winners: ${result.winnerMentions}`, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'reroll') {
      const record = giveawayUtils.getOldestEndedGiveawayForReroll(interaction.guild.id, interaction.channelId);
      if (!record) {
        return interaction.reply({
          embeds: [embeds.warning('No ended giveaways were found in this channel to reroll.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      const channel = await interaction.guild.channels.fetch(record.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return interaction.reply({
          embeds: [embeds.error('Giveaway channel no longer exists.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      const message = await channel.messages.fetch(record.messageId).catch(() => null);
      if (!message) {
        return interaction.reply({
          embeds: [embeds.error('Giveaway message no longer exists.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      const participantIds = await giveawayUtils.collectGiveawayParticipants(message);
      const winnerIds = giveawayUtils.pickWinners(participantIds, record.winnerCount);
      const winnerMentions = winnerIds.length ? winnerIds.map((id) => `<@${id}>`).join(', ') : 'No valid entries.';
      giveawayUtils.markGiveawayRerolled(interaction.guild.id, record.messageId, winnerIds);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle('Giveaway Reroll')
            .setDescription(`Prize: **${record.prize}**\nNew winner(s): ${winnerMentions}`),
        ],
      }).catch(() => null);
      return interaction.reply({
        embeds: [embeds.success(`Rerolled giveaway winner(s): ${winnerMentions}`, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [embeds.error('Unknown giveaway subcommand.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
  },

};
