'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set the slowmode delay for a channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) =>
      o
        .setName('seconds')
        .setDescription('Slowmode delay in seconds (0 = disabled, max 21600).')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600),
    )
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel to apply slowmode to (defaults to current channel).'),
    ),

  async execute(interaction) {
    const seconds = interaction.options.getInteger('seconds');
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    try {
      await channel.setRateLimitPerUser(seconds);

      if (seconds === 0) {
        return interaction.reply({
          embeds: [
            embeds
              .success(`Slowmode disabled in ${channel}.`, interaction.guild)
              .addFields({ name: '📌  Channel', value: `${channel}`, inline: true }),
          ],
        });
      }

      const display = seconds >= 3600
        ? `${Math.floor(seconds / 3600)}h ${seconds % 3600 > 0 ? `${Math.floor((seconds % 3600) / 60)}m` : ''}`.trim()
        : seconds >= 60
        ? `${Math.floor(seconds / 60)}m ${seconds % 60 > 0 ? `${seconds % 60}s` : ''}`.trim()
        : `${seconds}s`;

      return interaction.reply({
        embeds: [
          embeds
            .info('🐢  Slowmode Set', `Slowmode has been applied to ${channel}.`, interaction.guild)
            .setColor(0xfee75c)
            .addFields(
              { name: '📌  Channel', value: `${channel}`, inline: true },
              { name: '⏱️  Delay', value: `\`${display}\``, inline: true },
              { name: '🛡️  Set by', value: `${interaction.user}`, inline: true },
            ),
        ],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to set slowmode: \`${err.message}\``, interaction.guild)],
        ephemeral: true,
      });
    }
  },
};
