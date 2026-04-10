'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel so members cannot send messages.')
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Channel to lock (defaults to the current channel).'),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for locking the channel.'),
    ),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        ephemeral: true,
      });
    }

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';

    const everyoneRole = interaction.guild.roles.everyone;

    const currentPerms = channel.permissionOverwrites.cache.get(everyoneRole.id);
    if (currentPerms?.deny.has('SendMessages')) {
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
