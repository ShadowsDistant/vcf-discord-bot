'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');
const { sendCommandLog } = require('../../utils/moderationNotifications');

/** Format a slowmode delay in seconds to a human-readable string. */
function formatSlowmode(seconds) {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${seconds}s`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set the slowmode delay for a channel.')
    .setDMPermission(false)
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
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const seconds = interaction.options.getInteger('seconds');
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;

    try {
      await channel.setRateLimitPerUser(seconds);
      await sendCommandLog({
        guild: interaction.guild,
        moderator: interaction.user,
        action: 'Slowmode',
        target: `${channel.name} (${channel.id})`,
        details: seconds === 0 ? 'Slowmode disabled.' : `Set to ${formatSlowmode(seconds)}.`,
      });

      if (seconds === 0) {
        return interaction.reply({
          embeds: [
            embeds
              .success(`Slowmode disabled in ${channel}.`, interaction.guild)
              .addFields({ name: '  Channel', value: `${channel}`, inline: true }),
          ],
        });
      }

      const display = formatSlowmode(seconds);

      return interaction.reply({
        embeds: [
          embeds
            .info('  Slowmode Set', `Slowmode has been applied to ${channel}.`, interaction.guild)
            .setColor(0xfee75c)
            .addFields(
              { name: '  Channel', value: `${channel}`, inline: true },
              { name: 'Delay', value: `\`${display}\``, inline: true },
              { name: '  Set by', value: `${interaction.user}`, inline: true },
            ),
        ],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to set slowmode: \`${err.message}\``, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
