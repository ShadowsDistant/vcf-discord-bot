'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');

function ratingFor(ms) {
  if (ms < 80) return { label: '🟢 Excellent', color: 0x57f287 };
  if (ms < 150) return { label: '🟡 Good', color: 0xfee75c };
  if (ms < 300) return { label: '🟠 Fair', color: 0xf0b232 };
  return { label: '🔴 Poor', color: 0xed4245 };
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(' ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency and API response time.'),

  async execute(interaction) {
    const startedAt = Date.now();
    const sent = await interaction.reply({
      embeds: [embeds.info('Pinging…', 'Measuring latency…', interaction.guild)],
      fetchReply: true,
    });

    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);
    const worst = Math.max(roundtrip, apiLatency);
    const rating = ratingFor(worst);
    const dbStart = process.hrtime.bigint();
    try { require('../../utils/database').read('ai_usage_limits.json', {}); } catch { /* ignore */ }
    const dbMs = Number(process.hrtime.bigint() - dbStart) / 1_000_000;

    const mem = process.memoryUsage();
    const rssMb = (mem.rss / (1024 * 1024)).toFixed(1);
    const heapMb = (mem.heapUsed / (1024 * 1024)).toFixed(1);
    const wsStatusMap = ['Ready', 'Connecting', 'Reconnecting', 'Idle', 'Nearly', 'Disconnected', 'Waiting for Guilds'];
    const wsStatus = wsStatusMap[interaction.client.ws.status] ?? `Status ${interaction.client.ws.status}`;
    const shardCount = interaction.client.ws.shards?.size ?? 1;

    const embed = new EmbedBuilder()
      .setColor(rating.color)
      .setAuthor({ name: `${interaction.client.user.username} • Latency`, iconURL: interaction.client.user.displayAvatarURL() })
      .setTitle('🏓 Pong!')
      .setDescription([
        `**Overall:** ${rating.label}`,
        `Measured in ${Date.now() - startedAt}ms total.`,
      ].join('\n'))
      .addFields(
        { name: 'Roundtrip', value: `\`${roundtrip}ms\``, inline: true },
        { name: 'API Heartbeat', value: `\`${apiLatency}ms\``, inline: true },
        { name: 'Storage Read', value: `\`${dbMs.toFixed(1)}ms\``, inline: true },
        { name: 'Gateway', value: `\`${wsStatus}\``, inline: true },
        { name: 'Shards', value: `\`${shardCount}\``, inline: true },
        { name: 'Uptime', value: `\`${formatUptime(process.uptime() * 1000)}\``, inline: true },
        { name: 'Memory', value: `RSS \`${rssMb} MiB\` • Heap \`${heapMb} MiB\``, inline: false },
      )
      .setTimestamp()
      .setFooter({
        text: `Requested by ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      });

    return interaction.editReply({ embeds: [embed] });
  },
};
