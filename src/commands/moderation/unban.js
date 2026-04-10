'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const embeds = require('../../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a previously banned user.')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o
        .setName('user_id')
        .setDescription('The Discord user ID to unban.')
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for the unban.'),
    ),

  async execute(interaction) {
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';

    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply({
        embeds: [embeds.error('That does not look like a valid Discord user ID.', interaction.guild)],
        ephemeral: true,
      });
    }

    try {
      const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
      if (!ban) {
        return interaction.reply({
          embeds: [embeds.warning('That user is not banned in this server.', interaction.guild)],
          ephemeral: true,
        });
      }

      await interaction.guild.members.unban(userId, `${interaction.user.tag}: ${reason}`);

      return interaction.reply({
        embeds: [
          embeds.success(
            `**${ban.user.tag}** has been unbanned.\n**Reason:** ${reason}`,
            interaction.guild,
          ),
        ],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to unban: ${err.message}`, interaction.guild)],
        ephemeral: true,
      });
    }
  },
};
