'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');
const { formatDuration } = require('../../utils/helpers');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shiftmanage')
    .setDescription('Management tools for editing or deleting shift records.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List recent shift records and IDs.')
        .addUserOption((o) =>
          o.setName('user').setDescription('Filter to a specific user.'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('edit')
        .setDescription('Edit a shift record duration.')
        .addStringOption((o) =>
          o.setName('id').setDescription('Shift record ID.').setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('minutes')
            .setDescription('New duration in minutes.')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1440),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a shift record.')
        .addStringOption((o) =>
          o.setName('id').setDescription('Shift record ID.').setRequired(true),
        ),
    ),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.management)) {
      return interaction.reply({
        embeds: [embeds.error('You need management-level access to use this command.', interaction.guild)],
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'list') {
      const user = interaction.options.getUser('user');
      const rows = (user
        ? db.getUserShiftHistory(guildId, user.id)
        : db.getGuildShiftHistory(guildId))
        .slice(-15)
        .reverse();

      if (!rows.length) {
        return interaction.reply({
          embeds: [embeds.info('  Shift Records', 'No completed shift records found.', interaction.guild)],
          ephemeral: true,
        });
      }

      return interaction.reply({
        embeds: [
          embeds
            .shift('  Shift Records', 'Recent shift records (obtain IDs from this list for use with `edit` or `delete` subcommands).', interaction.guild)
            .addFields({
              name: '  Records',
              value: rows
                .map((s) => `\`${s.id}\` · <@${s.userId}> · ${formatDuration(s.durationMs)} · <t:${Math.floor(new Date(s.startedAt).getTime() / 1000)}:D>`)
                .join('\n'),
            }),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'edit') {
      const id = parseInt(interaction.options.getString('id'), 10);
      const minutes = interaction.options.getInteger('minutes');
      if (isNaN(id)) {
        return interaction.reply({
          embeds: [embeds.error('Invalid shift record ID.', interaction.guild)],
          ephemeral: true,
        });
      }

      const updated = db.updateShiftRecord(guildId, id, { durationMs: minutes * 60_000 });
      if (!updated) {
        return interaction.reply({
          embeds: [embeds.error(`No shift record found with ID \`${id}\`.`, interaction.guild)],
          ephemeral: true,
        });
      }

      return interaction.reply({
        embeds: [
          embeds.success(`Shift record \`${id}\` updated to **${minutes} minutes**.`, interaction.guild),
        ],
      });
    }

    if (sub === 'delete') {
      const id = parseInt(interaction.options.getString('id'), 10);
      if (isNaN(id)) {
        return interaction.reply({
          embeds: [embeds.error('Invalid shift record ID.', interaction.guild)],
          ephemeral: true,
        });
      }

      const removed = db.deleteShiftRecord(guildId, id);
      if (!removed) {
        return interaction.reply({
          embeds: [embeds.error(`No shift record found with ID \`${id}\`.`, interaction.guild)],
          ephemeral: true,
        });
      }

      return interaction.reply({
        embeds: [embeds.success(`Shift record \`${id}\` has been deleted.`, interaction.guild)],
      });
    }
  },
};
