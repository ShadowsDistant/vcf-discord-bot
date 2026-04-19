'use strict';

const { SlashCommandBuilder, EmbedBuilder, version: djsVersion } = require('discord.js');
const { PALETTE } = require('../../utils/embeds');
const { formatDuration } = require('../../utils/helpers');
const { version: botVersion } = require('../../../package.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Display detailed information and statistics about the bot.'),

  async execute(interaction) {
    const { client } = interaction;
    const uptimeMs = client.uptime ?? 0;

    const totalMembers = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);

    const memUsage = process.memoryUsage();
    const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(1);

    const createdTs = Math.floor(client.user.createdTimestamp / 1000);

    const embed = new EmbedBuilder()
      .setColor(PALETTE.primary)
      .setTitle(`  ${client.user.username}`)
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription('A feature-rich Discord bot built with discord.js.')
      .addFields(
        { name: 'Bot ID', value: `\`${client.user.id}\``, inline: true },
        { name: '  Tag', value: `\`${client.user.tag}\``, inline: true },
        { name: '  Created', value: `<t:${createdTs}:D> (<t:${createdTs}:R>)`, inline: true },
        {
          name: '  Statistics',
          value: [
            `Servers: **${client.guilds.cache.size.toLocaleString()}**`,
            `Members: **${totalMembers.toLocaleString()}**`,
            `Commands: **${client.commands.size}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '  Runtime',
          value: [
            `Bot Version: **v${botVersion}**`,
            `Uptime: **${formatDuration(uptimeMs)}**`,
            `Node.js: **${process.version}**`,
            `discord.js: **v${djsVersion}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '  Memory',
          value: `Heap: **${heapUsedMB} MB** / ${heapTotalMB} MB`,
          inline: true,
        },
        {
          name: '  Latency',
          value: `API Heartbeat: **${Math.round(client.ws.ping)}ms**`,
          inline: true,
        },
      )
      .setTimestamp()
      .setFooter({
        text: `Requested by ${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      });

    return interaction.reply({ embeds: [embed] });
  },
};
