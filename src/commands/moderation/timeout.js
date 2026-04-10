'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { parseDuration, formatDuration } = require('../../utils/helpers');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

// Discord's maximum timeout duration is 28 days in ms
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout (mute) a member for a specified duration.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName('user').setDescription('The member to timeout.').setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('duration')
        .setDescription('Duration, e.g. 10m, 2h, 1d (max 28d).')
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for the timeout.'),
    ),

  async execute(interaction) {
    // Mod-role check (Moderator level required when roles are configured)
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';

    const ms = parseDuration(durationStr);
    if (!ms) {
      return interaction.reply({
        embeds: [embeds.error('Invalid duration. Use formats like `10m`, `2h`, `1d`.', interaction.guild)],
        ephemeral: true,
      });
    }

    if (ms > MAX_TIMEOUT_MS) {
      return interaction.reply({
        embeds: [embeds.error('Duration cannot exceed 28 days.', interaction.guild)],
        ephemeral: true,
      });
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      return interaction.reply({
        embeds: [embeds.error('That user is not in this server.', interaction.guild)],
        ephemeral: true,
      });
    }

    if (!member.moderatable) {
      return interaction.reply({
        embeds: [embeds.error('I cannot timeout that user. They may have a higher role than me.', interaction.guild)],
        ephemeral: true,
      });
    }

    try {
      await member.timeout(ms, `${interaction.user.tag}: ${reason}`);
      return interaction.reply({
        embeds: [
          embeds.modAction({
            action: 'Member Timed Out',
            emoji: '',
            target,
            moderator: interaction.user,
            reason,
            duration: formatDuration(ms),
            guild: interaction.guild,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to timeout: ${err.message}`, interaction.guild)],
        ephemeral: true,
      });
    }
  },
};
