'use strict';

const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Report Message')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .setDMPermission(false),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId(`ctx_report_message:${interaction.targetMessage.channel.id}:${interaction.targetMessage.id}:${interaction.targetMessage.author.id}`)
      .setTitle('Report Message')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('category')
            .setLabel('Category (spam/harassment/etc)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Details')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500),
        ),
      );

    return interaction.showModal(modal);
  },
};
