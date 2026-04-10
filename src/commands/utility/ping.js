'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency and API response time.'),

  async execute(interaction) {
    const sent = await interaction.reply({
      embeds: [embeds.info('🏓  Pinging…', 'Calculating latency…', interaction.guild)],
      fetchReply: true,
    });

    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    return interaction.editReply({
      embeds: [
        embeds
          .info('🏓  Pong!', 'Bot is online and responsive.', interaction.guild)
          .addFields(
            { name: '📡  Roundtrip', value: `\`${roundtrip}ms\``, inline: true },
            { name: '💓  API Heartbeat', value: `\`${apiLatency}ms\``, inline: true },
          ),
      ],
    });
  },
};
