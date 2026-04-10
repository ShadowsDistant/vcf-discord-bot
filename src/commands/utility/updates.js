'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const { version: botVersion } = require('../../../package.json');
const { UPDATE_LOGS, createUpdateEmbed } = require('../../utils/updateLogs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updates')
    .setDescription('View the current bot version and recent public update logs.'),

  async execute(interaction) {
    const latest = UPDATE_LOGS[0];
    const previous = UPDATE_LOGS.slice(1, 11);
    const embed = createUpdateEmbed(interaction.guild, botVersion, latest, 0);

    const select = new StringSelectMenuBuilder()
      .setCustomId('updates_log_select')
      .setPlaceholder('View previous update logs')
      .addOptions(
        previous.map((entry, offset) => ({
          label: `${entry.version} • ${entry.date}`.slice(0, 100),
          description: (entry.changes[0] ?? 'Public update log').slice(0, 100),
          value: String(offset + 1),
        })),
      );

    const row = new ActionRowBuilder().addComponents(select);
    return interaction.reply({ embeds: [embed], components: [row] });
  },
};
