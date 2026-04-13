'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require('discord.js');
const economy = require('../../utils/bakeEconomy');
const embeds = require('../../utils/embeds');
const { MANAGEMENT_ROLE_IDS, ROLE_IDS, memberHasAnyRole } = require('../../utils/roles');

/**
 * Roles allowed to use /staffmessage (senior mod and above):
 *  - Senior Moderator
 *  - Lead Overseer
 *  - Management (helpManagementAccess)
 */
const SENIOR_MOD_PLUS_ROLE_IDS = new Set([
  ROLE_IDS.moderation.seniorModerator,
  ...MANAGEMENT_ROLE_IDS,
]);

function hasSeniorModPlus(member) {
  return memberHasAnyRole(member, SENIOR_MOD_PLUS_ROLE_IDS);
}

const MESSAGE_TYPES = [
  { label: '🍪 Bakery', value: 'bakery', description: 'A bakery-related notice or reward info.' },
  { label: '⚠️ Moderation', value: 'moderation', description: 'A moderation notice from staff.' },
  { label: '🔔 Notification', value: 'notification', description: 'A general staff notification.' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staffmessage')
    .setDescription('Send a message to specific users that appears in their /messages inbox.')
    .setDMPermission(false),

  async execute(interaction) {
    if (!hasSeniorModPlus(interaction.member)) {
      return interaction.reply({
        embeds: [embeds.error('You need to be a Senior Moderator or above to use this command.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Show a user select menu (max 5) first
    return interaction.reply({
      embeds: [
        {
          color: 0x5865f2,
          title: '📨 Staff Message — Select Recipients',
          description: 'Select up to **5 users** to send your message to. The message will appear in their `/messages` inbox.',
          timestamp: new Date().toISOString(),
          footer: { text: interaction.guild.name, icon_url: interaction.guild.iconURL() ?? undefined },
        },
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`staffmsg_user_select:${interaction.user.id}`)
            .setPlaceholder('Select up to 5 recipients...')
            .setMinValues(1)
            .setMaxValues(5),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },

  MESSAGE_TYPES,
  hasSeniorModPlus,
};
