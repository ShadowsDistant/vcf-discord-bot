'use strict';

const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Moderate User')
    .setType(ApplicationCommandType.User)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have permission to use this moderation panel.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const target = interaction.targetUser;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ctx_mod_warn:${target.id}`).setLabel('Warn').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ctx_mod_timeout5m:${target.id}`).setLabel('Timeout 5m').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ctx_mod_timeout1h:${target.id}`).setLabel('Timeout 1h').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ctx_mod_kick:${target.id}`).setLabel('Kick').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ctx_mod_ban:${target.id}`).setLabel('Ban').setStyle(ButtonStyle.Danger),
    );

    return interaction.reply({
      embeds: [embeds.info('Moderate User', `Target: ${target} (\`${target.id}\`)`, interaction.guild)],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};
