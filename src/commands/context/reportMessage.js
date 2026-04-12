'use strict';

const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  EmbedBuilder,
  ActionRowBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const REPORT_REASON_OPTIONS = [
  {
    label: 'Spam',
    value: 'spam',
    description: 'Repetitive, unsolicited, or disruptive spam content.',
  },
  {
    label: 'Harassment',
    value: 'harassment',
    description: 'Targeted abuse, bullying, or hateful behavior.',
  },
  {
    label: 'Scam / Fraud',
    value: 'scam',
    description: 'Phishing, fraud attempts, or suspicious links.',
  },
  {
    label: 'NSFW / Inappropriate',
    value: 'nsfw',
    description: 'Sexual, graphic, or otherwise inappropriate content.',
  },
  {
    label: 'Other',
    value: 'other',
    description: 'Any other issue that should be reviewed by staff.',
  },
];

module.exports = {
  data: new ContextMenuCommandBuilder()
    .setName('Report Message')
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .setDMPermission(false),

  async execute(interaction) {
    const promptEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('Report Message')
      .setDescription([
        'Select the reason for this report.',
        '',
        '⚠️ False reports may result in punishment.',
        '⏱️ You can submit one report every 15 minutes.',
      ].join('\n'));

    const reasonSelect = new StringSelectMenuBuilder()
      .setCustomId(`rmr:${interaction.targetMessage.channel.id}:${interaction.targetMessage.id}:${interaction.targetMessage.author.id}`)
      .setPlaceholder('Choose a report reason')
      .addOptions(REPORT_REASON_OPTIONS);

    return interaction.reply({
      embeds: [promptEmbed],
      components: [new ActionRowBuilder().addComponents(reasonSelect)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
