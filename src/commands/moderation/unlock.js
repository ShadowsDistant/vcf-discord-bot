'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a previously locked channel.')
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
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';

    const everyoneRole = interaction.guild.roles.everyone;

    try {
      await channel.permissionOverwrites.edit(everyoneRole, {
        SendMessages: null, // reset to inherit from category/default
      });

      return interaction.reply({
        embeds: [
          embeds
            .info('🔓  Channel Unlocked', `${channel} has been unlocked.`, interaction.guild)
            .setColor(0x57f287)
            .addFields(
              { name: '📌  Channel', value: `${channel}`, inline: true },
              { name: '🛡️  Moderator', value: `${interaction.user}`, inline: true },
              { name: '📋  Reason', value: reason },
            ),
        ],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to unlock channel: \`${err.message}\``, interaction.guild)],
        ephemeral: true,
      });
    }
  },
};
