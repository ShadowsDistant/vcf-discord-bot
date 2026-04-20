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
  return db.read(AI_USAGE_FILE, { usage: {}, userOverrides: {}, roleOverrides: {}, safetyToggleUsers: {}, deepResearchUsers: {} });
}

function writeUsage(mutator) {
  db.update(AI_USAGE_FILE, { usage: {}, userOverrides: {}, roleOverrides: {}, safetyToggleUsers: {}, deepResearchUsers: {} }, (data) => {
    if (!data.usage || typeof data.usage !== 'object') data.usage = {};
    if (!data.userOverrides || typeof data.userOverrides !== 'object') data.userOverrides = {};
    if (!data.roleOverrides || typeof data.roleOverrides !== 'object') data.roleOverrides = {};
    if (!data.safetyToggleUsers || typeof data.safetyToggleUsers !== 'object') data.safetyToggleUsers = {};
    if (!data.deepResearchUsers || typeof data.deepResearchUsers !== 'object') data.deepResearchUsers = {};
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
  const deepResearchCount = Object.keys(data.deepResearchUsers ?? {}).length;
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
      { name: '🔬 Deep Research', value: `${deepResearchCount} user(s)`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: guild.name, icon_url: guild.iconURL() ?? undefined });
}

const ACTION_OPTIONS = [
  { label: '📋 View User Info', value: 'view-user', description: "View a user's AI usage, limit, and overrides." },
  { label: '📋 View Role Info', value: 'view-role', description: "View a role's AI limit override and member count." },
  { label: '🎯 Set User Limit', value: 'set-user', description: 'Set a custom per-6h limit for a specific user.' },
  { label: '🎭 Set Role Limit', value: 'set-role', description: 'Set a custom per-6h limit for a role.' },
  { label: '🗑️ Clear User Limit', value: 'clear-user', description: "Remove a user's custom limit override." },
  { label: '🗑️ Clear Role Limit', value: 'clear-role', description: "Remove a role's custom limit override." },
  { label: '✨ Grant User Adjustment', value: 'grant-user', description: "Adjust a user's usage count this window." },
  { label: '✨ Grant Role Adjustment', value: 'grant-role', description: "Adjust usage count for all members in a role." },
  { label: '🔓 Allow Safety Toggle', value: 'allow-safety-user', description: 'Allow a user to disable AI safety in /ai.' },
  { label: '🔒 Disallow Safety Toggle', value: 'disallow-safety-user', description: "Remove a user's safety toggle permission." },
  { label: '🔬 Allow Deep Research', value: 'allow-deep-research-user', description: 'Allow a user to enable Deep Research in /ai.' },
  { label: '🧪 Disallow Deep Research', value: 'disallow-deep-research-user', description: "Remove a user's Deep Research access." },
];

const USER_ACTIONS = new Set(['view-user', 'set-user', 'clear-user', 'grant-user', 'allow-safety-user', 'disallow-safety-user', 'allow-deep-research-user', 'disallow-deep-research-user']);
const ROLE_ACTIONS = new Set(['view-role', 'set-role', 'clear-role', 'grant-role']);
const VALUE_ACTIONS = new Set(['set-user', 'set-role', 'grant-user', 'grant-role']);
const INFO_ACTIONS = new Set(['view-user', 'view-role']);

function buildUserInfoEmbed(guild, member, userId) {
  const data = readUsage();
  const bucketStart = getBucketStart();
  const resetTs = Math.floor((bucketStart + AI_USAGE_WINDOW_MS) / 1000);
  const targetId = member?.id ?? String(userId);
  const override = data.userOverrides?.[targetId] ?? null;
  const rec = data.usage?.[targetId] ?? {};
  const used = Number(rec.bucketStart) === bucketStart ? Number(rec.used ?? 0) : 0;
  const roleOverrides = data.roleOverrides ?? {};
  const memberRoleIds = member?.roles?.cache?.map((r) => r.id) ?? [];
  const matchedRoleOverrides = memberRoleIds
    .filter((id) => roleOverrides[id] && Number.isFinite(Number(roleOverrides[id].limit)))
    .map((id) => ({ id, limit: Number(roleOverrides[id].limit) }))
    .sort((a, b) => b.limit - a.limit);
  const safetyToggle = Boolean(data.safetyToggleUsers?.[targetId]);

  let effectiveLimit;
  let source;
  if (override && Number.isFinite(Number(override.limit))) {
    effectiveLimit = Number(override.limit);
    source = 'User override';
  } else if (matchedRoleOverrides.length > 0) {
    effectiveLimit = matchedRoleOverrides[0].limit;
    source = `Role override (<@&${matchedRoleOverrides[0].id}>)`;
  } else {
    effectiveLimit = null;
    source = 'Default (role-based baseline)';
  }
  const remaining = effectiveLimit === null ? 'default baseline' : `${Math.max(0, effectiveLimit - used)} / ${effectiveLimit}`;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📋 AI Usage — User Info')
    .setDescription(member ? `${member} (\`${member.user?.tag ?? targetId}\`)` : `<@${targetId}>`)
    .addFields(
      { name: 'Effective Limit Source', value: source, inline: false },
      { name: 'Effective Limit', value: effectiveLimit === null ? 'Default' : `${effectiveLimit}`, inline: true },
      { name: 'Used This Window', value: `${used}`, inline: true },
      { name: 'Remaining', value: `${remaining}`, inline: true },
      { name: 'Safety Toggle', value: safetyToggle ? '✅ Allowed' : '❌ Not allowed', inline: true },
      { name: 'Window Reset', value: `<t:${resetTs}:R>`, inline: true },
      {
        name: 'Role Overrides Matched',
        value: matchedRoleOverrides.length
          ? matchedRoleOverrides.map((r) => `<@&${r.id}> → **${r.limit}**`).join('\n')
          : '*None*',
        inline: false,
      },
    )
    .setTimestamp()
    .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined });
  if (member?.user) {
    embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
  }
  return embed;
}

function buildRoleInfoEmbed(guild, role) {
  const data = readUsage();
  const override = data.roleOverrides?.[role.id] ?? null;
  const overrideLimit = override && Number.isFinite(Number(override.limit)) ? Number(override.limit) : null;
  const bucketStart = getBucketStart();
  const resetTs = Math.floor((bucketStart + AI_USAGE_WINDOW_MS) / 1000);
  const memberCount = role.members?.size ?? 0;
  const activeInRole = Object.entries(data.usage ?? {})
    .filter(([id, rec]) => Number(rec.bucketStart) === bucketStart && Number(rec.used) > 0 && role.members?.has(id))
    .length;

  return new EmbedBuilder()
    .setColor(role.color || 0x5865f2)
    .setTitle('📋 AI Usage — Role Info')
    .setDescription(`${role} (\`${role.id}\`)`)
    .addFields(
      { name: 'Override Limit', value: overrideLimit === null ? '*None (default)*' : `${overrideLimit}`, inline: true },
      { name: 'Members in Role', value: `${memberCount}`, inline: true },
      { name: 'Active This Window', value: `${activeInRole}`, inline: true },
      { name: 'Role Color', value: role.hexColor ?? '#000000', inline: true },
      { name: 'Window Reset', value: `<t:${resetTs}:R>`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined });
}

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
  buildUserInfoEmbed,
  buildRoleInfoEmbed,
  ACTION_OPTIONS,
  USER_ACTIONS,
  ROLE_ACTIONS,
  VALUE_ACTIONS,
  INFO_ACTIONS,
  readUsage,
  writeUsage,
  getBucketStart,
  AI_USAGE_WINDOW_MS,
};
