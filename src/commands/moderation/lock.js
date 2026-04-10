'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel so members cannot send messages.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel to lock (defaults to the current channel).'),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for locking the channel.'),
    ),

  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';

    const everyoneRole = interaction.guild.roles.everyone;

    const currentPerms = channel.permissionOverwrites.cache.get(everyoneRole.id);
    if (currentPerms?.deny.has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({
        embeds: [embeds.warning(`${channel} is already locked.`, interaction.guild)],
        ephemeral: true,
      });
    }

    try {
      await channel.permissionOverwrites.edit(everyoneRole, {
        SendMessages: false,
      });

      return interaction.reply({
        embeds: [
          embeds
            .info('  Channel Locked', `${channel} has been locked.`, interaction.guild)
            .setColor(0xed4245)
            .addFields(
              { name: '  Channel', value: `${channel}`, inline: true },
              { name: '  Moderator', value: `${interaction.user}`, inline: true },
              { name: '  Reason', value: reason },
            ),
        ],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to lock channel: \`${err.message}\``, interaction.guild)],
        ephemeral: true,
      });
    }
  },
};
