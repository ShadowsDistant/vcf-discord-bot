'use strict';

const {
  SlashCommandBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server.')
    .addUserOption((o) =>
      o.setName('user').setDescription('The member to kick.').setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('reason')
        .setDescription('Reason for the kick. Start typing to see preset reasons.')
        .setAutocomplete(true),
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
    const reason = interaction.options.getString('reason') ?? 'No reason provided.';

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({
        embeds: [embeds.error('That user is not in this server.', interaction.guild)],
        ephemeral: true,
      });
    }

    if (!member.kickable) {
      return interaction.reply({
        embeds: [embeds.error('I cannot kick that user. They may have a higher role than me.', interaction.guild)],
        ephemeral: true,
      });
    }

    if (member.id === interaction.user.id) {
      return interaction.reply({
        embeds: [embeds.error('You cannot kick yourself.', interaction.guild)],
        ephemeral: true,
      });
    }

    try {
      await member.kick(`${interaction.user.tag}: ${reason}`);
      return interaction.reply({
        embeds: [
          embeds.modAction({
            action: 'Member Kicked',
            emoji: '',
            target,
            moderator: interaction.user,
            reason,
            guild: interaction.guild,
          }),
        ],
      });
    } catch (err) {
      return interaction.reply({
        embeds: [embeds.error(`Failed to kick: ${err.message}`, interaction.guild)],
        ephemeral: true,
      });
    }
  },
};
