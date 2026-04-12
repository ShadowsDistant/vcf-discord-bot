'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk-delete messages from the current channel.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o
        .setName('amount')
        .setDescription('Number of messages to delete (1–100).')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .addUserOption((o) =>
      o.setName('user').setDescription('Only delete messages from this user.'),
    ),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have the required moderation role to use this command.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const amount = interaction.options.getInteger('amount');
    const filterUser = interaction.options.getUser('user');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Fetch messages (Discord only bulk-deletes messages <14 days old)
    const fetchLimit = filterUser ? 100 : Math.min(100, amount);
    const fetched = await interaction.channel.messages.fetch({ limit: fetchLimit });

    let toDelete = [...fetched.values()];

    // Filter by user if requested
    if (filterUser) {
      toDelete = toDelete.filter((m) => m.author.id === filterUser.id);
    }

    // Limit to requested amount and filter out messages older than 14 days
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    toDelete = toDelete
      .filter((m) => m.createdTimestamp > twoWeeksAgo)
      .slice(0, amount);

    if (toDelete.length === 0) {
      return interaction.editReply({
        embeds: [embeds.warning('No eligible messages found to delete (messages must be under 14 days old).', interaction.guild)],
      });
    }

    const deleted = await interaction.channel.bulkDelete(toDelete, true);

    return interaction.editReply({
      embeds: [
        embeds.success(
          `Deleted **${deleted.size}** message${deleted.size !== 1 ? 's' : ''}${filterUser ? ` from **${filterUser.tag}**` : ''}.`,
          interaction.guild,
        ),
      ],
    });
  },
};
