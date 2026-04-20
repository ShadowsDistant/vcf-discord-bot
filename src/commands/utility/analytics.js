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
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const HOUR_HEATMAP_BUCKETS = ['🌙', '🌅', '☀️', '🌇'];

function resolveDays(period) {
  return PERIOD_CHOICES.find((entry) => entry.value === period)?.days ?? 7;
}

function formatShare(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return '0.0';
  return ((part / total) * 100).toFixed(1);
}

function formatHourRange(hour) {
  const h = Number(hour);
  const start = String(h).padStart(2, '0');
  const end = String((h + 1) % 24).padStart(2, '0');
  return `${start}:00–${end}:00 UTC`;
}

function buildSparkline(values) {
  if (!values.length) return '—';
  const max = Math.max(...values);
  if (max === 0) return SPARK_CHARS[0].repeat(values.length);
  return values
    .map((v) => SPARK_CHARS[Math.max(0, Math.min(SPARK_CHARS.length - 1, Math.round((v / max) * (SPARK_CHARS.length - 1))))])
    .join('');
}

function buildHourHeatmap(hourTotals) {
  const buckets = [0, 0, 0, 0]; // 0-5, 6-11, 12-17, 18-23
  for (const [hour, count] of Object.entries(hourTotals ?? {})) {
    const h = Number(hour);
    if (!Number.isFinite(h)) continue;
    buckets[Math.min(3, Math.floor(h / 6))] += Number(count ?? 0);
  }
  const total = buckets.reduce((a, b) => a + b, 0);
  if (!total) return '—';
  return buckets
    .map((b, idx) => `${HOUR_HEATMAP_BUCKETS[idx]} **${((b / total) * 100).toFixed(0)}%**`)
    .join(' · ');
}

function computeTrend(dayMessageTotals, dayKeys) {
  const values = dayKeys.map((d) => Number(dayMessageTotals?.[d] ?? 0));
  if (values.length < 2) return { label: '—', delta: 0 };
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / Math.max(1, firstHalf.length);
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / Math.max(1, secondHalf.length);
  if (avgFirst === 0 && avgSecond === 0) return { label: 'Flat', delta: 0 };
  if (avgFirst === 0) return { label: '📈 New activity', delta: 100 };
  const delta = ((avgSecond - avgFirst) / avgFirst) * 100;
  const sign = delta > 0 ? '📈' : delta < 0 ? '📉' : '➡️';
  return { label: `${sign} ${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`, delta };
}

function dayOfWeekLabel(dayKey) {
  const parsed = new Date(`${dayKey}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parsed.getUTCDay()];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('View detailed server analytics for a selected period.')
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

    if (targetUser) {
      const userActivity = analytics.getUserAnalytics(interaction.guild.id, targetUser.id, days);
      const snapshot = economy.getUserSnapshot(interaction.guild.id, targetUser.id);
      const u = snapshot.user;
      const rank = economy.RANKS.find((r) => r.id === u.rankId);
      const cps = economy.computeCps(u, Date.now());

      const topChannels = userActivity.channelTotals.length
        ? userActivity.channelTotals
          .map((entry, idx) => `\`#${idx + 1}\` <#${entry.channelId}> — **${entry.count.toLocaleString()}** msg${entry.count !== 1 ? 's' : ''}`)
          .join('\n')
        : '*No channel data.*';

      const peakHour = userActivity.peakHour
        ? `**${formatHourRange(userActivity.peakHour.hour)}** (${userActivity.peakHour.count.toLocaleString()} msgs)`
        : '*No hourly data.*';

      const busyHours = userActivity.busyHours.length
        ? userActivity.busyHours.map((entry, idx) => `\`#${idx + 1}\` **${formatHourRange(entry.hour)}** — ${entry.count.toLocaleString()} msgs`).join('\n')
        : '*No hourly data.*';

      const memberEntry = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setAuthor({ name: `${interaction.guild.name} • User Analytics`, iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined })
        .setTitle(`📈 ${targetUser.tag}`)
        .setDescription([
          `${targetUser} — detailed activity for **${period}**.`,
          memberEntry ? `Joined server <t:${Math.floor(memberEntry.joinedTimestamp / 1000)}:R> • Account created <t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>` : null,
        ].filter(Boolean).join('\n'))
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '- Messaging', value: [
            `Total: **${userActivity.messages.toLocaleString()}**`,
            `Active days: **${userActivity.activeDays}/${Math.max(1, userActivity.dayKeys.length)}**`,
            `Peak hour: ${peakHour}`,
          ].join('\n'), inline: false },
          { name: '📡 Top Channels', value: topChannels.slice(0, 1024), inline: true },
          { name: '- Busiest Hours', value: busyHours.slice(0, 1024), inline: true },
          { name: '- Bakery', value: [
            `Cookies: **${economy.toCookieNumber(u.cookies)}**`,
            `CPS: **${economy.toCookieNumber(cps)}/s**`,
            `Rank: **${rank?.name ?? 'Unknown'}**`,
            `Lifetime: **${economy.toCookieNumber(u.cookiesBakedAllTime)}**`,
          ].join('\n'), inline: true },
          { name: '🏆 Progression', value: [
            `Achievements: **${economy.getEarnedAchievementCount(u)}/${economy.ACHIEVEMENTS.length}**`,
            `Upgrades: **${(u.upgrades ?? []).length}**`,
            `Highest CPS: **${economy.toCookieNumber(u.highestCps ?? 0)}**`,
          ].join('\n'), inline: true },
        )
        .setTimestamp()
        .setFooter({
          text: `${interaction.guild.name} • Requested by ${interaction.user.tag}`,
          iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
        });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ── Server-wide ─────────────────────────────────────────────────────────
    const data = analytics.getAnalytics(interaction.guild.id, days);
    const modActions = data.modActions ?? { warn: 0, kick: 0, ban: 0 };
    const modTotal = Number(modActions.warn ?? 0) + Number(modActions.kick ?? 0) + Number(modActions.ban ?? 0);
    const modRatePerThousand = data.messages > 0 ? ((modTotal / data.messages) * MOD_RATE_SCALE) : 0;
    const netGrowth = data.joins - data.leaves;
    const joinToLeaveRatio = data.leaves > 0 ? (data.joins / data.leaves).toFixed(2) : data.joins > 0 ? '∞' : '—';
    const channelTop3Share = data.channelTotals.length > 0 && data.messages > 0
      ? Number(formatShare(data.channelTotals.slice(0, 3).reduce((sum, entry) => sum + entry.count, 0), data.messages))
      : 0;

    const dailySeries = data.dayKeys.map((k) => Number(data.dayMessageTotals?.[k] ?? 0));
    const trend = computeTrend(data.dayMessageTotals ?? {}, data.dayKeys);
    const spark = buildSparkline(dailySeries);
    const heatmap = buildHourHeatmap(data.hourTotals ?? {});

    const topChannels = data.channelTotals.length
      ? data.channelTotals
        .slice(0, 10)
        .map((entry, idx) => `\`#${String(idx + 1).padStart(2)}\` <#${entry.channelId}> — **${entry.count.toLocaleString()}** (${formatShare(entry.count, data.messages)}%)`)
        .join('\n')
      : '*No channel activity recorded.*';

    const peakHour = data.peakHour
      ? `**${data.peakHour.hour}:00–${String((Number(data.peakHour.hour) + 1) % 24).padStart(2, '0')}:00 UTC** (${data.peakHour.count.toLocaleString()} msgs)`
      : '*No hourly data.*';
    const topDays = data.topDays.length
      ? data.topDays
        .slice(0, 5)
        .map((entry, idx) => {
          const dow = dayOfWeekLabel(entry.day);
          return `\`#${idx + 1}\` **${entry.day}**${dow ? ` (${dow})` : ''} — ${entry.count.toLocaleString()} msgs`;
        })
        .join('\n')
      : '*No daily data.*';
    const busyHours = data.busyHours.length
      ? data.busyHours
        .slice(0, 5)
        .map((entry, idx) => `\`#${idx + 1}\` **${entry.hour}:00 UTC** — ${entry.count.toLocaleString()} msgs`)
        .join('\n')
      : '*No hourly data.*';
    const topAction = data.topAction
      ? `**${data.topAction.action.toUpperCase()}** (${data.topAction.count.toLocaleString()})`
      : '*None*';

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: `${interaction.guild.name} • Analytics`, iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined })
      .setTitle(`📈 Server Analytics — ${period}`)
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }) ?? null)
      .setDescription([
        data.dayKeys.length
          ? `**Coverage:** ${data.dayKeys[0]} → ${data.dayKeys[data.dayKeys.length - 1]} (${data.dayKeys.length} day${data.dayKeys.length === 1 ? '' : 's'})`
          : 'No analytics data yet.',
        data.dayKeys.length
          ? `**Activity trend:** ${trend.label}`
          : null,
        dailySeries.length
          ? `**Daily sparkline:** \`${spark}\``
          : null,
      ].filter(Boolean).join('\n'))
      .addFields(
        { name: '- Member Flow', value: [
          `Joins: **${data.joins.toLocaleString()}**`,
          `Leaves: **${data.leaves.toLocaleString()}**`,
          `Net: **${netGrowth >= 0 ? '+' : ''}${netGrowth.toLocaleString()}**`,
          `J/L ratio: **${joinToLeaveRatio}**`,
        ].join('\n'), inline: true },
        { name: '- Messages', value: [
          `Total: **${data.messages.toLocaleString()}**`,
          `Avg/day: **${Math.round(data.avgDailyMessages).toLocaleString()}**`,
          `Avg/active day: **${Math.round(data.avgMessagesPerActiveDay).toLocaleString()}**`,
          `Active days: **${data.activeDays}/${Math.max(1, data.dayKeys.length)}**`,
        ].join('\n'), inline: true },
        { name: '- Moderation', value: [
          `Warns: **${modActions.warn.toLocaleString()}**`,
          `Kicks: **${modActions.kick.toLocaleString()}**`,
          `Bans: **${modActions.ban.toLocaleString()}**`,
          `Top action: ${topAction}`,
          `Rate: **${modRatePerThousand.toFixed(2)}** / 1k msgs`,
        ].join('\n'), inline: true },
        { name: '- Peak Activity', value: [
          `Peak hour: ${peakHour}`,
          `Time-of-day share: ${heatmap}`,
        ].join('\n'), inline: false },
        { name: '🧭 Distribution', value: [
          `Top-3 channel share: **${channelTop3Share.toFixed(1)}%**`,
          `Unique active channels (top 10 shown): **${data.channelTotals.length}**`,
        ].join('\n'), inline: false },
        { name: '📡 Top Channels (Top 10)', value: topChannels.slice(0, 1024), inline: false },
        { name: '📅 Top Days', value: topDays.slice(0, 1024), inline: true },
        { name: '⏱️ Busiest Hours', value: busyHours.slice(0, 1024), inline: true },
      )
      .setTimestamp()
      .setFooter({
        text: `${interaction.guild.name} • Requested by ${interaction.user.tag}`,
        iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
      });

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
