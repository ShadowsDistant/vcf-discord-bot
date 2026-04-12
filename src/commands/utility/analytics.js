'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const analytics = require('../../utils/analytics');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

const PERIOD_CHOICES = [
  { name: '24h', value: '1d', days: 1 },
  { name: '7d', value: '7d', days: 7 },
  { name: '30d', value: '30d', days: 30 },
];

function resolveDays(period) {
  return PERIOD_CHOICES.find((entry) => entry.value === period)?.days ?? 7;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('View server analytics for a selected period.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) =>
      o
        .setName('period')
        .setDescription('Analytics window')
        .addChoices(...PERIOD_CHOICES.map((entry) => ({ name: entry.name, value: entry.value }))),
    ),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have permission to view analytics.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const period = interaction.options.getString('period') ?? '7d';
    const days = resolveDays(period);
    const data = analytics.getAnalytics(interaction.guild.id, days);

    const topChannels = data.channelTotals.length
      ? data.channelTotals
        .map((entry, idx) => `${idx + 1}. <#${entry.channelId}> — **${entry.count.toLocaleString()}**`) 
        .join('\n')
      : 'No channel activity recorded.';

    const peakHour = data.peakHour
      ? `**${data.peakHour.hour}:00–${String((Number(data.peakHour.hour) + 1) % 24).padStart(2, '0')}:00 UTC** (${data.peakHour.count.toLocaleString()} msgs)`
      : 'No hourly data recorded.';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📈 Server Analytics (${period})`)
      .setDescription(
        data.dayKeys.length
          ? `Coverage: **${data.dayKeys[0]} → ${data.dayKeys[data.dayKeys.length - 1]}**`
          : 'No analytics data yet.',
      )
      .addFields(
        {
          name: 'Member Flow',
          value: [
            `Joins: **${data.joins.toLocaleString()}**`,
            `Leaves: **${data.leaves.toLocaleString()}**`,
            `Net: **${(data.joins - data.leaves).toLocaleString()}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Message Activity',
          value: [
            `Total messages: **${data.messages.toLocaleString()}**`,
            `Peak hour: ${peakHour}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Moderation Actions',
          value: [
            `Warns: **${data.modActions.warn.toLocaleString()}**`,
            `Kicks: **${data.modActions.kick.toLocaleString()}**`,
            `Bans: **${data.modActions.ban.toLocaleString()}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Top Active Channels',
          value: topChannels.slice(0, 1024),
        },
      )
      .setTimestamp()
      .setFooter({
        text: interaction.guild.name,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      });

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
