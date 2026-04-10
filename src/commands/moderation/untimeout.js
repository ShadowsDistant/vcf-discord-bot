'use strict';

const {
  SlashCommandBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove a timeout from a member.')
    .addUserOption((o) =>
      o.setName('user').setDescription('The member to un-timeout.').setRequired(true),
    )
    .addStringOption((o) =>
      o.setName('reason').setDescription('Reason for removing the timeout.'),
    ),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        ephemeral: true,
      });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      return interaction.reply({
        embeds: [embeds.error('That user is not in this server.', interaction.guild)],
        ephemeral: true,
      });
    }

    if (!member.isCommunicationDisabled()) {
      return interaction.reply({
        embeds: [embeds.warning('That member is not currently timed out.', interaction.guild)],
        ephemeral: true,
      });
    }

    try {
      await member.timeout(null, `${interaction.user.tag}: ${reason}`);
      return interaction.reply({
        embeds: [
          embeds.success(
            `Timeout removed from **${target.tag}**.\n**Reason:** ${reason}`,
            interaction.guild,
          ),
        ],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to remove timeout: ${err.message}`, interaction.guild)],
        ephemeral: true,
      });
    }
  },
};
