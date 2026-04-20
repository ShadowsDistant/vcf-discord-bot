'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const economy = require('../../utils/bakeEconomy');
const embeds = require('../../utils/embeds');
const {
  MANAGEMENT_ROLE_IDS,
  ALL_STAFF_ROLE_IDS,
  MODERATION_ROLE_IDS,
  SID_ROLE_IDS,
  OSC_ROLE_IDS,
  FACILITY_ROLE_IDS,
  ROLE_IDS,
  memberHasAnyRole,
} = require('../../utils/roles');

/**
 * Only Lead Overseer or management-level roles may use this command.
 */
const LEAD_MANAGEMENT_ROLE_IDS = new Set([
  ROLE_IDS.leadOverseer,
  ...ROLE_IDS.helpManagementAccess,
]);

function hasLeadManagement(member) {
  return memberHasAnyRole(member, LEAD_MANAGEMENT_ROLE_IDS);
}

const AUDIENCE_OPTIONS = [
  {
    label: '- Everyone',
    value: 'everyone',
    description: 'All non-bot members in this guild.',
  },
  {
    label: '- Moderation Team',
    value: 'role:moderation',
    description: 'Users with Moderator, Senior Moderator, or Junior Moderator.',
  },
  {
    label: '🔍 SID Team',
    value: 'role:sid',
    description: 'Users with Investigator, Senior Investigator, or Lead Investigator.',
  },
  {
    label: '⚖️ Oversight Committee',
    value: 'role:osc',
    description: 'Users with Oversight Committee or Lead Overseer.',
  },
  {
    label: '🏛️ Facility Management',
    value: 'role:facility',
    description: 'Users with any Facility Management role.',
  },
  {
    label: '- All Staff',
    value: 'role:all_staff',
    description: 'All staff members across all departments.',
  },
  {
    label: '🤖 VAI Access',
    value: 'role:vai_access',
    description: 'Users with the VAI Access role (1493414609678499890).',
  },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('broadcastmessage')
    .setDescription('Broadcast a message to everyone or a role group — appears in their /messages inbox.')
    .setDMPermission(false),

  async execute(interaction) {
    if (!hasLeadManagement(interaction.member)) {
      return interaction.reply({
        embeds: [embeds.error('You need to be Lead Oversight or Management to use this command.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [
        {
          color: 0x5865f2,
          title: '- Broadcast Message — Select Audience',
          description: 'Choose who will receive this message. It will appear in their `/messages` inbox.',
          timestamp: new Date().toISOString(),
          footer: { text: interaction.guild.name, icon_url: interaction.guild.iconURL() ?? undefined },
        },
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`broadcastmsg_audience_select:${interaction.user.id}`)
            .setPlaceholder('Select target audience...')
            .addOptions(AUDIENCE_OPTIONS),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },

  hasLeadManagement,
  AUDIENCE_OPTIONS,
  LEAD_MANAGEMENT_ROLE_IDS,
  MODERATION_ROLE_IDS,
  SID_ROLE_IDS,
  OSC_ROLE_IDS,
  FACILITY_ROLE_IDS,
  ALL_STAFF_ROLE_IDS,
};
