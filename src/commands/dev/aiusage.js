'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');

const AI_USAGE_FILE = 'ai_usage_limits.json';
const AI_USAGE_WINDOW_MS = 6 * 60 * 60 * 1000;

function canManageAiUsage(member) {
  return member?.id === '757698506411475005';
}

function readUsage() {
  return db.read(AI_USAGE_FILE, { usage: {}, userOverrides: {}, roleOverrides: {}, safetyToggleUsers: {} });
}

function writeUsage(mutator) {
  db.update(AI_USAGE_FILE, { usage: {}, userOverrides: {}, roleOverrides: {}, safetyToggleUsers: {} }, (data) => {
    if (!data.usage || typeof data.usage !== 'object') data.usage = {};
    if (!data.userOverrides || typeof data.userOverrides !== 'object') data.userOverrides = {};
    if (!data.roleOverrides || typeof data.roleOverrides !== 'object') data.roleOverrides = {};
    if (!data.safetyToggleUsers || typeof data.safetyToggleUsers !== 'object') data.safetyToggleUsers = {};
    mutator(data);
  });
}

function getBucketStart(now = Date.now()) {
  return Math.floor(now / AI_USAGE_WINDOW_MS) * AI_USAGE_WINDOW_MS;
}

function buildAiManagePanel(guild, actorId) {
  const data = readUsage();
  const bucketStart = getBucketStart();
  const resetTs = Math.floor((bucketStart + AI_USAGE_WINDOW_MS) / 1000);
  const userOverrideCount = Object.keys(data.userOverrides ?? {}).length;
  const roleOverrideCount = Object.keys(data.roleOverrides ?? {}).length;
  const safetyToggleCount = Object.keys(data.safetyToggleUsers ?? {}).length;
  const activeUsageCount = Object.values(data.usage ?? {})
    .filter((rec) => Number(rec.bucketStart) === bucketStart && Number(rec.used) > 0)
    .length;

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🤖 AI Usage Management')
    .setDescription('Manage user limits, role overrides, adjustments, and safety toggle access.\nSelect an action from the menu below.')
    .addFields(
      { name: '⏱️ Window Reset', value: `<t:${resetTs}:R>`, inline: true },
      { name: '📊 Active Users', value: `${activeUsageCount}`, inline: true },
      { name: '👤 User Overrides', value: `${userOverrideCount}`, inline: true },
      { name: '🎭 Role Overrides', value: `${roleOverrideCount}`, inline: true },
      { name: '🔓 Safety Toggle', value: `${safetyToggleCount} user(s)`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: guild.name, icon_url: guild.iconURL() ?? undefined });
}

const ACTION_OPTIONS = [
  { label: '🎯 Set User Limit', value: 'set-user', description: 'Set a custom per-6h limit for a specific user.' },
  { label: '🎭 Set Role Limit', value: 'set-role', description: 'Set a custom per-6h limit for a role.' },
  { label: '🗑️ Clear User Limit', value: 'clear-user', description: "Remove a user's custom limit override." },
  { label: '🗑️ Clear Role Limit', value: 'clear-role', description: "Remove a role's custom limit override." },
  { label: '✨ Grant User Adjustment', value: 'grant-user', description: "Adjust a user's usage count this window." },
  { label: '✨ Grant Role Adjustment', value: 'grant-role', description: "Adjust usage count for all members in a role." },
  { label: '🔓 Allow Safety Toggle', value: 'allow-safety-user', description: 'Allow a user to disable AI safety in /ai.' },
  { label: '🔒 Disallow Safety Toggle', value: 'disallow-safety-user', description: "Remove a user's safety toggle permission." },
];

const USER_ACTIONS = new Set(['set-user', 'clear-user', 'grant-user', 'allow-safety-user', 'disallow-safety-user']);
const ROLE_ACTIONS = new Set(['set-role', 'clear-role', 'grant-role']);
const VALUE_ACTIONS = new Set(['set-user', 'set-role', 'grant-user', 'grant-role']);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aimanage')
    .setDescription('Open the AI usage management panel.')
    .setDMPermission(false),

  async execute(interaction) {
    if (!canManageAiUsage(interaction.member)) {
      return interaction.reply({
        embeds: [embeds.error('You do not have permission to manage AI usage.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }
    return interaction.reply({
      embeds: [buildAiManagePanel(interaction.guild, interaction.user.id)],
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`aimanage_action_select:${interaction.user.id}`)
            .setPlaceholder('Select an action...')
            .addOptions(ACTION_OPTIONS),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },

  canManageAiUsage,
  buildAiManagePanel,
  ACTION_OPTIONS,
  USER_ACTIONS,
  ROLE_ACTIONS,
  VALUE_ACTIONS,
  readUsage,
  writeUsage,
  getBucketStart,
  AI_USAGE_WINDOW_MS,
};
