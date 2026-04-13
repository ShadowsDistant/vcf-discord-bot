'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const analytics = require('../../utils/analytics');
const embeds = require('../../utils/embeds');
const economy = require('../../utils/bakeEconomy');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

const PERIOD_CHOICES = [
  { name: '24h', value: '1d', days: 1 },
  { name: '7d', value: '7d', days: 7 },
  { name: '30d', value: '30d', days: 30 },
];
const MOD_RATE_SCALE = 1000;

function resolveDays(period) {
  return PERIOD_CHOICES.find((entry) => entry.value === period)?.days ?? 7;
}

function formatShare(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return '0.0';
  return ((part / total) * 100).toFixed(1);
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
    )
    .addUserOption((o) =>
      o
        .setName('user')
        .setDescription('Optional user to include detailed bakery stats for')
        .setRequired(false),
    ),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have permission to view analytics.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const period = interaction.options.getString('period') ?? '7d';
    const targetUser = interaction.options.getUser('user');
    const days = resolveDays(period);
    const data = analytics.getAnalytics(interaction.guild.id, days);
    const modActions = data.modActions ?? { warn: 0, kick: 0, ban: 0 };
    const modTotal = Number(modActions.warn ?? 0) + Number(modActions.kick ?? 0) + Number(modActions.ban ?? 0);
    const modRatePerThousand = data.messages > 0 ? ((modTotal / data.messages) * MOD_RATE_SCALE) : 0;
    const channelConcentration = data.channelTotals.length > 0 && data.messages > 0
      ? Number(formatShare(data.channelTotals.slice(0, 3).reduce((sum, entry) => sum + entry.count, 0), data.messages))
      : 0;
    const peakDay = data.topDays[0] ?? null;

    const topChannels = data.channelTotals.length
      ? data.channelTotals
        .map((entry, idx) => `${idx + 1}. <#${entry.channelId}> — **${entry.count.toLocaleString()}** (${formatShare(entry.count, data.messages)}%)`)
        .join('\n')
      : 'No channel activity recorded.';

    const peakHour = data.peakHour
      ? `**${data.peakHour.hour}:00–${String((Number(data.peakHour.hour) + 1) % 24).padStart(2, '0')}:00 UTC** (${data.peakHour.count.toLocaleString()} msgs)`
      : 'No hourly data recorded.';
    const channelShare = data.messages > 0 && data.channelTotals[0]
      ? `${formatShare(data.channelTotals[0].count, data.messages)}%`
      : '0.0%';
    const topDays = data.topDays.length
      ? data.topDays.map((entry, idx) => `${idx + 1}. **${entry.day}** — ${entry.count.toLocaleString()} msgs`).join('\n')
      : 'No daily message data.';
    const busyHours = data.busyHours.length
      ? data.busyHours
        .map((entry, idx) => `${idx + 1}. **${entry.hour}:00 UTC** — ${entry.count.toLocaleString()} msgs`)
        .join('\n')
      : 'No hourly distribution available.';
    const topAction = data.topAction
      ? `${data.topAction.action.toUpperCase()} (${data.topAction.count.toLocaleString()})`
      : 'No moderation actions.';
    const specificUserSnapshot = targetUser ? economy.getUserSnapshot(interaction.guild.id, targetUser.id) : null;
    const specificUserStats = specificUserSnapshot?.user ?? null;
    const specificUserField = specificUserStats
      ? [
        `User: ${targetUser} (\`${targetUser.id}\`)`,
        `Cookies: **${economy.toCookieNumber(specificUserStats.cookies)}**`,
        `CPS: **${economy.toCookieNumber(economy.computeCps(specificUserStats, Date.now()))}**`,
        `Lifetime baked: **${economy.toCookieNumber(specificUserStats.cookiesBakedAllTime)}**`,
        `Total bakes: **${economy.toCookieNumber(specificUserStats.totalBakes)}**`,
        `Achievements: **${(specificUserStats.milestones ?? []).length}/${economy.ACHIEVEMENTS.length}**`,
      ].join('\n')
      : null;

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
            `Avg/day: **${Math.round(data.avgDailyMessages).toLocaleString()}**`,
            `Avg/active day: **${Math.round(data.avgMessagesPerActiveDay).toLocaleString()}**`,
            `Active days: **${data.activeDays}/${Math.max(1, data.dayKeys.length)}**`,
            `Peak hour: ${peakHour}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Moderation Actions & Enforcement',
          value: [
            `Warns: **${modActions.warn.toLocaleString()}**`,
            `Kicks: **${modActions.kick.toLocaleString()}**`,
            `Bans: **${modActions.ban.toLocaleString()}**`,
            `Top action: **${topAction}**`,
            `Actions / 1k msgs: **${modRatePerThousand.toFixed(2)}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Server Health Signals',
          value: [
            `Peak day: **${peakDay ? `${peakDay.day} (${peakDay.count.toLocaleString()} msgs)` : 'None'}**`,
            `Channel concentration (Top 3): **${channelConcentration.toFixed(1)}%**`,
            `Coverage days with activity: **${data.activeDays}/${Math.max(1, data.dayKeys.length)}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Top Active Channels',
          value: `${topChannels}\n\nTop channel share: **${channelShare}**`.slice(0, 1024),
        },
        {
          name: 'Top Message Days',
          value: topDays.slice(0, 1024),
        },
        {
          name: 'Busiest Hours',
          value: busyHours.slice(0, 1024),
        },
        ...(specificUserField ? [{ name: 'Specific User Bakery Stats', value: specificUserField.slice(0, 1024) }] : []),
      )
      .setTimestamp()
      .setFooter({
        text: interaction.guild.name,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      });

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
