'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');
const { sendCommandLog } = require('../../utils/moderationNotifications');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a previously locked channel.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel to unlock (defaults to the current channel).'),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for unlocking the channel.'),
    ),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';

    const everyoneRole = interaction.guild.roles.everyone;

    try {
      await channel.permissionOverwrites.edit(everyoneRole, {
        SendMessages: null, // reset to inherit from category/default
      });
      await sendCommandLog({
        guild: interaction.guild,
        moderator: interaction.user,
        action: 'Unlock Channel',
        target: `${channel.name} (${channel.id})`,
        details: `Reason: ${reason}`,
      });

      return interaction.reply({
        embeds: [
          embeds
            .info('  Channel Unlocked', `${channel} has been unlocked.`, interaction.guild)
            .setColor(0x57f287)
            .addFields(
              { name: '  Channel', value: `${channel}`, inline: true },
              { name: '  Moderator', value: `${interaction.user}`, inline: true },
              { name: '  Reason', value: reason },
            ),
        ],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to unlock channel: \`${err.message}\``, interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
