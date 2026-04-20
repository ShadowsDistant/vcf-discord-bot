'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const db = require('../../utils/database');

const AI_USAGE_FILE = 'ai_usage_limits.json';
const AI_USAGE_WINDOW_MS = 6 * 60 * 60 * 1000;

const OWNER_USER_ID = '757698506411475005';

function canManageAiUsage(member) {
  return member?.id === OWNER_USER_ID;
}

function defaultUsageState() {
  return {
    usage: {},
    userOverrides: {},
    roleOverrides: {},
    safetyToggleUsers: {},
    deepResearchUsers: {},
  };
}

function readUsage() {
  return db.read(AI_USAGE_FILE, defaultUsageState());
}

function writeUsage(mutator) {
  db.update(AI_USAGE_FILE, defaultUsageState(), (data) => {
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

/* ------------------------------------------------------------------ *
 *  Main panel
 * ------------------------------------------------------------------ */

function buildPanelEmbed(guild) {
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
    .setColor(embeds.PALETTE?.primary ?? 0x5865f2)
    .setTitle('🤖 AI Usage Management')
    .setDescription(
      'Manage per-user and per-role AI limits, safety toggles, and Deep Research access.\n'
      + 'Pick a **user** or **role** below to open their management card.',
    )
    .addFields(
      { name: '⏱️ Window Reset', value: `<t:${resetTs}:R>`, inline: true },
      { name: '📈 Active Users', value: `\`${activeUsageCount}\``, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '- User Overrides', value: `\`${userOverrideCount}\``, inline: true },
      { name: '- Role Overrides', value: `\`${roleOverrideCount}\``, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '- Safety Toggle', value: `\`${safetyToggleCount}\` user(s)`, inline: true },
      { name: '- Deep Research', value: `\`${deepResearchCount}\` user(s)`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: guild.name, iconURL: guild.iconURL?.() ?? undefined });
}

function buildPanelComponents(actorId) {
  return [
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`aimanage_user_select:${actorId}`)
        .setPlaceholder('- Select a user to manage…')
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId(`aimanage_role_select:${actorId}`)
        .setPlaceholder('- Select a role to manage…')
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`aimanage_refresh:${actorId}`)
        .setLabel('Refresh')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`aimanage_close:${actorId}`)
        .setLabel('Close')
        .setEmoji('✗')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

/* ------------------------------------------------------------------ *
 *  User management card
 * ------------------------------------------------------------------ */

function resolveUserEffective(data, member, userId) {
  const bucketStart = getBucketStart();
  const targetId = member?.id ?? String(userId);
  const override = data.userOverrides?.[targetId] ?? null;
  const rec = data.usage?.[targetId] ?? {};
  const used = Number(rec.bucketStart) === bucketStart ? Number(rec.used ?? 0) : 0;
  const roleOverrides = data.roleOverrides ?? {};
  const memberRoleIds = member?.roles?.cache?.map((r) => r.id) ?? [];
  const matchedRoleOverrides = memberRoleIds
    .filter((id) => roleOverrides[id] && (Number.isFinite(Number(roleOverrides[id].limit)) || roleOverrides[id].unlimited))
    .map((id) => ({
      id,
      limit: Number(roleOverrides[id].limit),
      unlimited: Boolean(roleOverrides[id].unlimited),
    }))
    .sort((a, b) => {
      if (a.unlimited && !b.unlimited) return -1;
      if (!a.unlimited && b.unlimited) return 1;
      return (Number.isFinite(b.limit) ? b.limit : 0) - (Number.isFinite(a.limit) ? a.limit : 0);
    });

  let effectiveLimit;
  let effectiveUnlimited = false;
  let source;
  if (override?.unlimited) {
    effectiveLimit = null;
    effectiveUnlimited = true;
    source = 'User override (unlimited)';
  } else if (override && Number.isFinite(Number(override.limit))) {
    effectiveLimit = Number(override.limit);
    source = 'User override';
  } else if (matchedRoleOverrides.length > 0) {
    const top = matchedRoleOverrides[0];
    if (top.unlimited) {
      effectiveLimit = null;
      effectiveUnlimited = true;
      source = `Role override (<@&${top.id}>, unlimited)`;
    } else {
      effectiveLimit = top.limit;
      source = `Role override (<@&${top.id}>)`;
    }
  } else {
    effectiveLimit = null;
    source = 'Default (role-based baseline)';
  }

  return {
    targetId,
    used,
    override,
    matchedRoleOverrides,
    effectiveLimit,
    effectiveUnlimited,
    source,
    hasUserOverride: Boolean(override),
    safetyAllowed: Boolean(data.safetyToggleUsers?.[targetId]),
    deepResearchAllowed: Boolean(data.deepResearchUsers?.[targetId]),
  };
}

function buildUserCardEmbed(guild, member, userId) {
  const data = readUsage();
  const info = resolveUserEffective(data, member, userId);
  const bucketStart = getBucketStart();
  const resetTs = Math.floor((bucketStart + AI_USAGE_WINDOW_MS) / 1000);

  const limitDisplay = info.effectiveUnlimited
    ? '♾️ Unlimited'
    : info.effectiveLimit === null
      ? 'Default'
      : `\`${info.effectiveLimit}\` / 6h`;

  const remainingDisplay = info.effectiveUnlimited
    ? '♾️ Unlimited'
    : info.effectiveLimit === null
      ? 'Default baseline'
      : `\`${Math.max(0, info.effectiveLimit - info.used)}\` / \`${info.effectiveLimit}\``;

  const embed = new EmbedBuilder()
    .setColor(embeds.PALETTE?.primary ?? 0x5865f2)
    .setTitle('- AI Usage — User Management')
    .setDescription(
      member
        ? `${member} — \`${member.user?.tag ?? info.targetId}\`\n*ID: \`${info.targetId}\`*`
        : `<@${info.targetId}> — *not in this guild*\n*ID: \`${info.targetId}\`*`,
    )
    .addFields(
      { name: '📏 Effective Limit', value: limitDisplay, inline: true },
      { name: '📈 Used', value: `\`${info.used}\``, inline: true },
      { name: '🎟️ Remaining', value: remainingDisplay, inline: true },
      { name: '🗂️ Source', value: info.source, inline: false },
      { name: '- Safety Toggle', value: info.safetyAllowed ? '✓ Allowed' : '✗ Not allowed', inline: true },
      { name: '- Deep Research', value: info.deepResearchAllowed ? '✓ Allowed' : '✗ Not allowed', inline: true },
      { name: '⏱️ Window Reset', value: `<t:${resetTs}:R>`, inline: true },
      {
        name: '- Matched Role Overrides',
        value: info.matchedRoleOverrides.length
          ? info.matchedRoleOverrides
            .map((r) => `• <@&${r.id}> → ${r.unlimited ? '♾️ Unlimited' : `\`${r.limit}\` / 6h`}`)
            .join('\n')
          : '*None*',
        inline: false,
      },
    )
    .setTimestamp()
    .setFooter({ text: guild.name, iconURL: guild.iconURL?.() ?? undefined });

  if (member?.user) {
    embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
  }

  return embed;
}

function buildUserCardComponents(actorId, targetId, info) {
  const setLabel = info.hasUserOverride ? 'Update Limit' : 'Set Limit';
  const clearBtn = new ButtonBuilder()
    .setCustomId(`aimanage_u_btn:${actorId}:${targetId}:clear`)
    .setLabel('Clear Limit')
        .setStyle(ButtonStyle.Secondary)
    .setDisabled(!info.hasUserOverride);

  const safetyBtn = info.safetyAllowed
    ? new ButtonBuilder()
      .setCustomId(`aimanage_u_btn:${actorId}:${targetId}:safety_off`)
      .setLabel('Revoke Safety Toggle')
            .setStyle(ButtonStyle.Secondary)
    : new ButtonBuilder()
      .setCustomId(`aimanage_u_btn:${actorId}:${targetId}:safety_on`)
      .setLabel('Allow Safety Toggle')
            .setStyle(ButtonStyle.Success);

  const drBtn = info.deepResearchAllowed
    ? new ButtonBuilder()
      .setCustomId(`aimanage_u_btn:${actorId}:${targetId}:dr_off`)
      .setLabel('Revoke Deep Research')
      .setEmoji('🧪')
      .setStyle(ButtonStyle.Secondary)
    : new ButtonBuilder()
      .setCustomId(`aimanage_u_btn:${actorId}:${targetId}:dr_on`)
      .setLabel('Allow Deep Research')
            .setStyle(ButtonStyle.Success);

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`aimanage_u_btn:${actorId}:${targetId}:set`)
        .setLabel(setLabel)
        .setEmoji('🎯')
        .setStyle(ButtonStyle.Primary),
      clearBtn,
      new ButtonBuilder()
        .setCustomId(`aimanage_u_btn:${actorId}:${targetId}:grant`)
        .setLabel('Grant Credits')
                .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`aimanage_u_btn:${actorId}:${targetId}:reset_usage`)
        .setLabel('Reset Usage')
        .setEmoji('♻️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(info.used === 0),
    ),
    new ActionRowBuilder().addComponents(safetyBtn, drBtn),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`aimanage_back:${actorId}`)
        .setLabel('Back to Panel')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`aimanage_refresh_user:${actorId}:${targetId}`)
        .setLabel('Refresh')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/* ------------------------------------------------------------------ *
 *  Role management card
 * ------------------------------------------------------------------ */

function resolveRoleEffective(data, role) {
  const override = data.roleOverrides?.[role.id] ?? null;
  const unlimited = Boolean(override?.unlimited);
  const overrideLimit = override && Number.isFinite(Number(override.limit)) ? Number(override.limit) : null;
  return {
    override,
    unlimited,
    overrideLimit,
    hasOverride: Boolean(override),
  };
}

function buildRoleCardEmbed(guild, role) {
  const data = readUsage();
  const info = resolveRoleEffective(data, role);
  const bucketStart = getBucketStart();
  const resetTs = Math.floor((bucketStart + AI_USAGE_WINDOW_MS) / 1000);
  const memberCount = role.members?.size ?? 0;
  const activeInRole = Object.entries(data.usage ?? {})
    .filter(([id, rec]) => Number(rec.bucketStart) === bucketStart && Number(rec.used) > 0 && role.members?.has(id))
    .length;

  const limitDisplay = info.unlimited
    ? '♾️ Unlimited'
    : info.overrideLimit === null
      ? '*None — default baseline applies*'
      : `\`${info.overrideLimit}\` / 6h`;

  return new EmbedBuilder()
    .setColor(role.color || embeds.PALETTE?.primary || 0x5865f2)
    .setTitle('- AI Usage — Role Management')
    .setDescription(`${role} — \`${role.id}\``)
    .addFields(
      { name: '📏 Override Limit', value: limitDisplay, inline: true },
      { name: '- Members', value: `\`${memberCount}\``, inline: true },
      { name: '📈 Active This Window', value: `\`${activeInRole}\``, inline: true },
      { name: '🎨 Role Color', value: role.hexColor ?? '#000000', inline: true },
      { name: '⏱️ Window Reset', value: `<t:${resetTs}:R>`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
    )
    .setTimestamp()
    .setFooter({ text: guild.name, iconURL: guild.iconURL?.() ?? undefined });
}

function buildRoleCardComponents(actorId, roleId, info) {
  const setLabel = info.hasOverride ? 'Update Limit' : 'Set Limit';
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`aimanage_r_btn:${actorId}:${roleId}:set`)
        .setLabel(setLabel)
        .setEmoji('🎯')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`aimanage_r_btn:${actorId}:${roleId}:clear`)
        .setLabel('Clear Limit')
                .setStyle(ButtonStyle.Secondary)
        .setDisabled(!info.hasOverride),
      new ButtonBuilder()
        .setCustomId(`aimanage_r_btn:${actorId}:${roleId}:grant`)
        .setLabel('Grant Credits')
                .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`aimanage_back:${actorId}`)
        .setLabel('Back to Panel')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`aimanage_refresh_role:${actorId}:${roleId}`)
        .setLabel('Refresh')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/* ------------------------------------------------------------------ *
 *  Slash command
 * ------------------------------------------------------------------ */

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
      embeds: [buildPanelEmbed(interaction.guild)],
      components: buildPanelComponents(interaction.user.id),
      flags: MessageFlags.Ephemeral,
    });
  },

  // Exports used by the interaction handler
  canManageAiUsage,
  readUsage,
  writeUsage,
  getBucketStart,
  AI_USAGE_WINDOW_MS,
  OWNER_USER_ID,

  buildPanelEmbed,
  buildPanelComponents,
  buildUserCardEmbed,
  buildUserCardComponents,
  buildRoleCardEmbed,
  buildRoleCardComponents,
  resolveUserEffective,
  resolveRoleEffective,
};
