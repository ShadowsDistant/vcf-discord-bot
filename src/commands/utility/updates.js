'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { version: botVersion } = require('../../../package.json');
const { UPDATE_LOGS, createUpdateEmbed } = require('../../utils/updateLogs');

const MAX_SELECT = 25;

function buildNavRow(currentIndex) {
  const clamped = Math.max(0, Math.min(UPDATE_LOGS.length - 1, currentIndex));
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`updates_nav:latest`)
      .setLabel('⏮ Latest')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clamped === 0),
    new ButtonBuilder()
      .setCustomId(`updates_nav:prev:${clamped}`)
      .setLabel('◀ Newer')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(clamped === 0),
    new ButtonBuilder()
      .setCustomId(`updates_nav:next:${clamped}`)
      .setLabel('Older ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(clamped >= UPDATE_LOGS.length - 1),
    new ButtonBuilder()
      .setCustomId(`updates_nav:oldest`)
      .setLabel('Oldest ⏭')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clamped === UPDATE_LOGS.length - 1),
  );
}

function buildSelectRow(currentIndex) {
  const options = UPDATE_LOGS.slice(0, MAX_SELECT).map((entry, idx) => ({
    label: `${entry.version} • ${entry.date}`.slice(0, 100),
    description: (entry.changes[0] ?? 'Public update log').slice(0, 100),
    value: String(idx),
    default: idx === currentIndex,
    emoji: idx === 0 ? '-' : '📦',
  }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('updates_log_select')
      .setPlaceholder('Jump to another update log…')
      .addOptions(options),
  );
}

function buildUpdatesResponse(guild, index) {
  const clamped = Math.max(0, Math.min(UPDATE_LOGS.length - 1, index));
  const embed = createUpdateEmbed(guild, botVersion, UPDATE_LOGS[clamped], clamped);
  return {
    embeds: [embed],
    components: [buildSelectRow(clamped), buildNavRow(clamped)],
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updates')
    .setDescription('View the current bot version and recent public update logs.'),

  async execute(interaction) {
    return interaction.reply(buildUpdatesResponse(interaction.guild, 0));
  },

  buildUpdatesResponse,
  buildNavRow,
  buildSelectRow,
};
