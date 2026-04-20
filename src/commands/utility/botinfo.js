'use strict';

const os = require('node:os');
const { SlashCommandBuilder, EmbedBuilder, version: djsVersion } = require('discord.js');
const { PALETTE } = require('../../utils/embeds');
const { formatDuration } = require('../../utils/helpers');
const { version: botVersion } = require('../../../package.json');

const REPO_URL = 'https://github.com/ShadowsDistant/vcf-discord-bot';

function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MiB`;
  return `${(mb / 1024).toFixed(2)} GiB`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Display detailed information and statistics about the bot.'),

  async execute(interaction) {
    const { client } = interaction;
    const uptimeMs = client.uptime ?? 0;

    const totalMembers = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);
    const totalChannels = client.channels.cache.size;
    const textChannels = client.channels.cache.filter((c) => c.isTextBased?.() && !c.isVoiceBased?.()).size;
    const voiceChannels = client.channels.cache.filter((c) => c.isVoiceBased?.()).size;
    const totalRoles = client.guilds.cache.reduce((sum, g) => sum + g.roles.cache.size, 0);
    const totalEmojis = client.emojis.cache.size;

    const memUsage = process.memoryUsage();
    const sysLoad = os.loadavg()[0].toFixed(2);
    const sysMemUsedPct = (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1);

    const createdTs = Math.floor(client.user.createdTimestamp / 1000);
    const apiLatency = Math.round(client.ws.ping);
    const wsStatusMap = ['Ready', 'Connecting', 'Reconnecting', 'Idle', 'Nearly', 'Disconnected', 'Waiting for Guilds'];
    const wsStatus = wsStatusMap[client.ws.status] ?? `Status ${client.ws.status}`;

    const embed = new EmbedBuilder()
      .setColor(PALETTE.primary)
      .setAuthor({ name: `${client.user.username}`, iconURL: client.user.displayAvatarURL() })
      .setTitle('🤖 Bot Info')
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription([
        'A feature-rich Discord bot powering moderation, management, economy, and AI for VCF.',
        `**Version:** \`v${botVersion}\` • **Uptime:** \`${formatDuration(uptimeMs)}\``,
      ].join('\n'))
      .addFields(
        { name: '🆔 Identity', value: [
          `**Tag:** \`${client.user.tag}\``,
          `**ID:** \`${client.user.id}\``,
          `**Created:** <t:${createdTs}:D> (<t:${createdTs}:R>)`,
        ].join('\n'), inline: false },
        { name: '- Reach', value: [
          `Servers: **${client.guilds.cache.size.toLocaleString()}**`,
          `Members: **${totalMembers.toLocaleString()}**`,
          `Channels: **${totalChannels}** (- ${textChannels} / 🔊 ${voiceChannels})`,
          `Roles: **${totalRoles.toLocaleString()}** • Emojis: **${totalEmojis}**`,
        ].join('\n'), inline: true },
        { name: '- Runtime', value: [
          `Node.js: **${process.version}**`,
          `discord.js: **v${djsVersion}**`,
          `Commands: **${client.commands.size}**`,
          `Shards: **${client.ws.shards?.size ?? 1}**`,
        ].join('\n'), inline: true },
        { name: '📡 Gateway', value: [
          `Status: **${wsStatus}**`,
          `API Heartbeat: **${apiLatency}ms**`,
        ].join('\n'), inline: true },
        { name: '💾 Memory', value: [
          `Heap: **${formatBytes(memUsage.heapUsed)}** / ${formatBytes(memUsage.heapTotal)}`,
          `RSS: **${formatBytes(memUsage.rss)}**`,
          `External: **${formatBytes(memUsage.external)}**`,
        ].join('\n'), inline: true },
        { name: '🖥️ Host', value: [
          `Platform: **${os.platform()} ${os.arch()}**`,
          `CPU Cores: **${os.cpus().length}**`,
          `Load (1m): **${sysLoad}**`,
          `System RAM: **${sysMemUsedPct}%** used`,
        ].join('\n'), inline: true },
        { name: '⏱️ Process', value: [
          `Bot Uptime: **${formatDuration(uptimeMs)}**`,
          `Process PID: **${process.pid}**`,
          `OS Uptime: **${formatDuration(os.uptime() * 1000)}**`,
        ].join('\n'), inline: true },
      )
      .setTimestamp()
      .setFooter({
        text: `Requested by ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      });

    return interaction.reply({ embeds: [embed] });
  },
};
