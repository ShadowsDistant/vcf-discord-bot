'use strict';

const { randomUUID } = require('node:crypto');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  EmbedBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../utils/database');
const { formatDuration, parseDuration } = require('../utils/helpers');
const { fetchRobloxProfileByUsername, createRobloxEmbed } = require('../utils/roblox');
const { ROLE_IDS } = require('../utils/roles');
const { hasModLevel, MOD_LEVEL } = require('../utils/permissions');
const { UPDATE_LOGS, createUpdateEmbed } = require('../utils/updateLogs');
const economy = require('../utils/bakeEconomy');
const alliances = require('../utils/bakeAlliances');
const commandRestrictions = require('../utils/commandRestrictions');
const bakeCommand = require('../commands/utility/bake');
const allianceCommand = require('../commands/utility/alliance');
const helpCommand = require('../commands/utility/help');
const shiftCommand = require('../commands/shifts/shift');
const automodCommand = require('../commands/setup/automod');
const staffInfractionCommand = require('../commands/moderation/staffinfraction');
const staffMessageCommand = require('../commands/moderation/staffmessage');
const broadcastMessageCommand = require('../commands/moderation/broadcastmessage');
const aiManageCommand = require('../commands/dev/aiusage');
const challenges = require('../utils/bakeryChallenges');
const { sendModerationActionDm, sendModLog, sendCommandLog } = require('../utils/moderationNotifications');
const analytics = require('../utils/analytics');
const { version: botVersion } = require('../../package.json');

/** Commands whose `reason` option supports preset-reason autocomplete. */
const REASON_AUTOCOMPLETE_COMMANDS = new Set(['ban', 'kick', 'warn']);
const ERROR_DETAIL_LIMIT = 500;
const MAX_SELECT_MENU_OPTIONS = 25;
const DEFAULT_GUIDE_SECTION = 'info';
const BAKERY_RENAME_TTL_MS = 10 * 60 * 1000;
const GUIDE_STATE_TTL_MS = 60 * 60 * 1000;
const SPECIAL_COOKIE_EVENT_CHANNEL_ID = '1492690923333746790';
const BAKE_COMMANDS_CHANNEL_ID = '1492310367869862089';
const BAKE_COMMANDS_CHANNEL_URL = `https://discord.com/channels/1345804368263385170/${BAKE_COMMANDS_CHANNEL_ID}`;
const REPORTS_CHANNEL_ID = '1492689950540435637';
const REPORTS_PING_ROLE_ID = '1425569078596337745';
const RULES_CHANNEL_URL = 'https://discord.com/channels/1345804368263385170/1359474500973674667';
const REPORT_COOLDOWN_MS = 15 * 60 * 1000;
const REPORT_REASON_LABELS = new Map([
  ['spam', 'Spam'],
  ['harassment', 'Harassment'],
  ['scam', 'Scam / Fraud'],
  ['nsfw', 'NSFW / Inappropriate'],
  ['other', 'Other'],
]);
const REPORT_ACTION_CODE_BY_ACTION = Object.freeze({
  delete_message: 'dm',
  warn_author: 'wa',
  timeout_author: 'ta',
  dismiss: 'di',
});
const REPORT_ACTION_BY_CODE = Object.freeze(Object.fromEntries(
  Object.entries(REPORT_ACTION_CODE_BY_ACTION).map(([action, code]) => [code, action]),
));
const COMPONENT_EXPIRY_DEFAULT_MS = 10 * 60 * 1000;
const COMPONENT_EXPIRY_LONG_MS = 30 * 60 * 1000;
const REPORT_WARN_MODAL_PREFIX = 'report_warn_reason:';
const REPORT_TIMEOUT_MODAL_PREFIX = 'report_timeout_config:';
const AUTOMOD_REVIEW_TIMEOUT_MODAL_PREFIX = 'amr_timeout_modal:';
const MAX_PENDING_RENAME_SELECTIONS = 2_000;
const MAX_GUIDE_VIEW_SELECTIONS = 5_000;
const STAFF_MESSAGE_SELECTION_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_STAFF_MESSAGE_SELECTIONS = 2_000;
const GIFT_QUICK_SELL_TTL_MS = 15 * 60 * 1000;
const MAX_PENDING_GIFT_QUICK_SELLS = 5_000;
const SERVER_BOOSTER_ROLE_ID = '1357082479931949310';
const DESCRIPTION_TRUNCATE_WORD_BOUNDARY_RATIO = 0.5;
const pendingBakeryRenameSelections = new Map();
const guideViewSelections = new Map();
const reportCooldowns = new Map();
const pendingStaffMessageSelections = new Map();
const pendingGiftQuickSellSelections = new Map();

function prunePendingBakeryRenameSelections(now = Date.now()) {
  const expiredKeys = [...pendingBakeryRenameSelections.entries()]
    .filter(([, entry]) => (entry?.expiresAt ?? 0) <= now)
    .map(([key]) => key);
  for (const key of expiredKeys) pendingBakeryRenameSelections.delete(key);
  if (pendingBakeryRenameSelections.size > MAX_PENDING_RENAME_SELECTIONS) {
    const overflow = pendingBakeryRenameSelections.size - MAX_PENDING_RENAME_SELECTIONS;
    const oldestKeys = [...pendingBakeryRenameSelections.entries()]
      .sort((a, b) => (a[1]?.expiresAt ?? 0) - (b[1]?.expiresAt ?? 0))
      .slice(0, overflow)
      .map(([key]) => key);
    for (const key of oldestKeys) pendingBakeryRenameSelections.delete(key);
  }
}

function setPendingBakeryRenameSelection(guildId, userId, bakeryName) {
  prunePendingBakeryRenameSelections();
  pendingBakeryRenameSelections.set(`${guildId}:${userId}`, {
    bakeryName,
    expiresAt: Date.now() + BAKERY_RENAME_TTL_MS,
  });
}

function getPendingBakeryRenameSelection(guildId, userId) {
  prunePendingBakeryRenameSelections();
  const entry = pendingBakeryRenameSelections.get(`${guildId}:${userId}`);
  if (!entry) return null;
  return entry.bakeryName ?? null;
}

function clearPendingBakeryRenameSelection(guildId, userId) {
  pendingBakeryRenameSelections.delete(`${guildId}:${userId}`);
}

function prunePendingStaffMessageSelections(now = Date.now()) {
  const expiredKeys = [...pendingStaffMessageSelections.entries()]
    .filter(([, entry]) => (entry?.expiresAt ?? 0) <= now)
    .map(([key]) => key);
  for (const key of expiredKeys) pendingStaffMessageSelections.delete(key);
  if (pendingStaffMessageSelections.size > MAX_PENDING_STAFF_MESSAGE_SELECTIONS) {
    const overflow = pendingStaffMessageSelections.size - MAX_PENDING_STAFF_MESSAGE_SELECTIONS;
    const oldestKeys = [...pendingStaffMessageSelections.entries()]
      .sort((a, b) => (a[1]?.expiresAt ?? 0) - (b[1]?.expiresAt ?? 0))
      .slice(0, overflow)
      .map(([key]) => key);
    for (const key of oldestKeys) pendingStaffMessageSelections.delete(key);
  }
}

function setPendingStaffMessageSelection(guildId, actorId, recipientIds) {
  prunePendingStaffMessageSelections();
  pendingStaffMessageSelections.set(`${guildId}:${actorId}`, {
    recipientIds: [...recipientIds],
    expiresAt: Date.now() + STAFF_MESSAGE_SELECTION_TTL_MS,
  });
}

function getPendingStaffMessageSelection(guildId, actorId) {
  prunePendingStaffMessageSelections();
  const entry = pendingStaffMessageSelections.get(`${guildId}:${actorId}`);
  return Array.isArray(entry?.recipientIds) ? [...entry.recipientIds] : [];
}

function clearPendingStaffMessageSelection(guildId, actorId) {
  pendingStaffMessageSelections.delete(`${guildId}:${actorId}`);
}

function prunePendingGiftQuickSellSelections(now = Date.now()) {
  const expiredKeys = [...pendingGiftQuickSellSelections.entries()]
    .filter(([, entry]) => (entry?.expiresAt ?? 0) <= now)
    .map(([key]) => key);
  for (const key of expiredKeys) pendingGiftQuickSellSelections.delete(key);
  if (pendingGiftQuickSellSelections.size > MAX_PENDING_GIFT_QUICK_SELLS) {
    const overflow = pendingGiftQuickSellSelections.size - MAX_PENDING_GIFT_QUICK_SELLS;
    const oldestKeys = [...pendingGiftQuickSellSelections.entries()]
      .sort((a, b) => (a[1]?.expiresAt ?? 0) - (b[1]?.expiresAt ?? 0))
      .slice(0, overflow)
      .map(([key]) => key);
    for (const key of oldestKeys) pendingGiftQuickSellSelections.delete(key);
  }
}

function setPendingGiftQuickSellSelection(guildId, userId, rewardBoxId, grants) {
  prunePendingGiftQuickSellSelections();
  const dropQuantities = {};
  for (const grant of grants ?? []) {
    const itemId = String(grant?.itemId ?? '').trim();
    const quantity = Number.parseInt(grant?.quantity, 10);
    if (!itemId || !Number.isInteger(quantity) || quantity <= 0) continue;
    dropQuantities[itemId] = (dropQuantities[itemId] ?? 0) + quantity;
  }
  const token = randomUUID();
  pendingGiftQuickSellSelections.set(`${guildId}:${userId}:${token}`, {
    rewardBoxId,
    dropQuantities,
    expiresAt: Date.now() + GIFT_QUICK_SELL_TTL_MS,
  });
  return token;
}

function popPendingGiftQuickSellSelection(guildId, userId, token) {
  prunePendingGiftQuickSellSelections();
  const key = `${guildId}:${userId}:${token}`;
  const entry = pendingGiftQuickSellSelections.get(key);
  if (!entry) return null;
  pendingGiftQuickSellSelections.delete(key);
  return entry;
}

function encodeBroadcastAudience(audience) {
  return encodeURIComponent(String(audience ?? ''));
}

function decodeBroadcastAudience(encodedAudience) {
  try {
    return decodeURIComponent(String(encodedAudience ?? ''));
  } catch {
    return String(encodedAudience ?? '');
  }
}

function getBroadcastAudienceLabel(audienceValue) {
  const option = (broadcastMessageCommand.AUDIENCE_OPTIONS ?? []).find((entry) => entry.value === audienceValue);
  return option?.label ?? audienceValue;
}

function getGuideState(guildId, userId) {
  pruneGuideStateSelections();
  const entry = guideViewSelections.get(`${guildId}:${userId}`);
  if (!entry) return { section: DEFAULT_GUIDE_SECTION, page: 0 };
  return { section: entry.section, page: entry.page };
}

function setGuideState(guildId, userId, section, page) {
  pruneGuideStateSelections();
  guideViewSelections.set(`${guildId}:${userId}`, {
    section: section ?? DEFAULT_GUIDE_SECTION,
    page: Number.isFinite(page) ? Math.max(0, page) : 0,
    expiresAt: Date.now() + GUIDE_STATE_TTL_MS,
  });
}

function pruneGuideStateSelections(now = Date.now()) {
  const expiredKeys = [...guideViewSelections.entries()]
    .filter(([, entry]) => (entry?.expiresAt ?? 0) <= now)
    .map(([key]) => key);
  for (const key of expiredKeys) guideViewSelections.delete(key);
  if (guideViewSelections.size > MAX_GUIDE_VIEW_SELECTIONS) {
    const overflow = guideViewSelections.size - MAX_GUIDE_VIEW_SELECTIONS;
    const oldestKeys = [...guideViewSelections.entries()]
      .sort((a, b) => (a[1]?.expiresAt ?? 0) - (b[1]?.expiresAt ?? 0))
      .slice(0, overflow)
      .map(([key]) => key);
    for (const key of oldestKeys) guideViewSelections.delete(key);
  }
}

const renameSelectionPruneTimer = setInterval(
  () => prunePendingBakeryRenameSelections(Date.now()),
  Math.min(BAKERY_RENAME_TTL_MS, 60_000),
);
const guideStatePruneTimer = setInterval(
  () => pruneGuideStateSelections(Date.now()),
  60_000,
);
const giftQuickSellPruneTimer = setInterval(
  () => prunePendingGiftQuickSellSelections(Date.now()),
  60_000,
);
if (typeof renameSelectionPruneTimer.unref === 'function') renameSelectionPruneTimer.unref();
if (typeof guideStatePruneTimer.unref === 'function') guideStatePruneTimer.unref();
if (typeof giftQuickSellPruneTimer.unref === 'function') giftQuickSellPruneTimer.unref();

function buildInventoryItemSelectOptions(user, guild) {
  return Object.entries(user.inventory ?? {})
    .filter(([, qty]) => qty > 0)
    .sort(([, qtyA], [, qtyB]) => qtyB - qtyA)
    .slice(0, MAX_SELECT_MENU_OPTIONS)
    .map(([itemId, qty]) => ({
      label: `${economy.ITEM_MAP.get(itemId)?.name ?? itemId}`.slice(0, 100),
      description: `Owned: ${qty}`.slice(0, 100),
      value: itemId,
      emoji: economy.getItemEmoji(itemId, guild),
    }));
}

async function sendBakeAdminLog(interaction, targetUserId, action, details) {
  const channelId = economy.getAdminLogChannelId(interaction.guild.id);
  if (!channelId) return;
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('Bake Admin Action')
    .setDescription([
      `**Moderator:** ${interaction.user.tag} (\`${interaction.user.id}\`)`,
      `**Target:** <@${targetUserId}> (\`${targetUserId}\`)`,
      `**Action:** ${action}`,
      `**Details:** ${details}`,
    ].join('\n'))
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => null);
}

async function sendBakeEventStartLog(interaction, eventDef, durationMinutes, startsAt, endsAt) {
  const channel = await interaction.guild.channels.fetch(SPECIAL_COOKIE_EVENT_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const startedAtTs = Math.floor((Number.isFinite(startsAt) ? startsAt : Date.now()) / 1000);
  const endsAtTs = Math.floor(endsAt / 1000);
  const eventEmojis = {
    special_cookie_hunt: '-',
    golden_fever: '-',
    sugar_rush: '-',
    steady_heat: '🔥',
  };
  const eventColors = {
    special_cookie_hunt: 0xfee75c,
    golden_fever: 0xffd700,
    sugar_rush: 0xff6b35,
    steady_heat: 0xed4245,
  };
  const emoji = eventEmojis[eventDef.id] ?? '🎉';
  const color = eventColors[eventDef.id] ?? 0x5865f2;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji} ${eventDef.name} is Live!`)
    .setDescription([
      `Hosted by <@${interaction.user.id}>`,
      `**${eventDef.description}**`,
      `Run your bake commands here: <#${BAKE_COMMANDS_CHANNEL_ID}>`,
    ].join('\n'))
    .addFields(
      { name: '- Starts', value: `<t:${startedAtTs}:F> (<t:${startedAtTs}:R>)`, inline: true },
      { name: '🏁 Ends', value: `<t:${endsAtTs}:F> (<t:${endsAtTs}:R>)`, inline: true },
      { name: '⏱️ Duration', value: `**${durationMinutes} minute${durationMinutes === 1 ? '' : 's'}**`, inline: true },
    )
    .setTimestamp()
    .setFooter({
      text: interaction.guild.name,
      iconURL: interaction.guild.iconURL({ dynamic: true }) ?? undefined,
    });
  const actions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('- Open Bake Commands')
      .setURL(BAKE_COMMANDS_CHANNEL_URL),
  );
  await channel.send({ embeds: [embed], components: [actions] }).catch(() => null);
}

// Legacy alias used at other call sites
async function sendSpecialCookieHuntStartLog(interaction, durationMinutes, startsAt, endsAt) {
  const eventDef = economy.COOKIE_EVENT_DEFINITIONS.find((e) => e.id === 'special_cookie_hunt') ?? { id: 'special_cookie_hunt', name: 'Special Cookie Hunt', description: 'Special cookie drops are boosted.' };
  return sendBakeEventStartLog(interaction, eventDef, durationMinutes, startsAt, endsAt);
}

function getErrorDetails(err) {
  if (!err) return 'Unknown error.';
  const errorName = typeof err.name === 'string' && err.name.trim().length > 0 ? err.name.trim() : 'Error';
  const errorMessage = typeof err.message === 'string' && err.message.trim().length > 0
    ? err.message.trim()
    : String(err);
  const combined = `${errorName}: ${errorMessage}`;
  if (combined.length <= ERROR_DETAIL_LIMIT) return combined;
  return `${combined.slice(0, ERROR_DETAIL_LIMIT - 3)}...`;
}

function isUnknownInteractionError(error) {
  if (!error || typeof error !== 'object') return false;
  if (Number(error.code) === 10062) return true;
  return String(error.message ?? '').toLowerCase().includes('unknown interaction');
}

function getComponentOwnerId(interaction) {
  return interaction.message?.interactionMetadata?.user?.id ?? null;
}

function getComponentExpiryMs(customId) {
  if (customId?.startsWith('alliance_ad_join:')) {
    return Number.POSITIVE_INFINITY;
  }
  if (
    customId?.startsWith('bakery_')
    || customId?.startsWith('market_')
    || customId?.startsWith('messages_')
    || customId === 'updates_log_select'
    || customId?.startsWith('updates_nav:')
    || customId?.startsWith('help_category_select:')
    || customId?.startsWith('aimanage_')
  ) {
    return COMPONENT_EXPIRY_LONG_MS;
  }
  return COMPONENT_EXPIRY_DEFAULT_MS;
}

function isComponentExpired(interaction, nowTs = Date.now()) {
  const createdTs = interaction.message?.createdTimestamp;
  if (!Number.isFinite(createdTs)) return false;
  return (nowTs - createdTs) > getComponentExpiryMs(interaction.customId);
}

function chunkSelectOptions(options, size = MAX_SELECT_MENU_OPTIONS) {
  const chunks = [];
  for (let idx = 0; idx < options.length; idx += size) {
    chunks.push(options.slice(idx, idx + size));
  }
  return chunks;
}

function clampSelectValue(requested, optionCount) {
  return Math.max(1, Math.min(Number(requested) || 1, optionCount));
}

function truncateSelectDescription(text, limit = 100) {
  const raw = String(text ?? '').trim();
  if (raw.length <= limit) return raw;
  const truncated = raw.slice(0, Math.max(1, limit - 1));
  const cut = truncated.lastIndexOf(' ');
  const boundaryThreshold = Math.floor(limit * DESCRIPTION_TRUNCATE_WORD_BOUNDARY_RATIO);
  const hasSafeWordBoundary = cut >= boundaryThreshold;
  const safe = hasSafeWordBoundary ? truncated.slice(0, cut) : truncated;
  return `${safe.trimEnd()}…`;
}

function buildPagedStringSelectRows({
  customIdPrefix,
  placeholderBase,
  options,
  minValues = 1,
  maxValues = 1,
}) {
  const optionChunks = chunkSelectOptions(options, MAX_SELECT_MENU_OPTIONS).slice(0, 5);
  return optionChunks.map((chunk, chunkIndex) =>
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${customIdPrefix}:${chunkIndex}`)
        .setPlaceholder(optionChunks.length > 1 ? `${placeholderBase} (${chunkIndex + 1}/${optionChunks.length})` : placeholderBase)
        .setMinValues(clampSelectValue(minValues, chunk.length))
        .setMaxValues(clampSelectValue(maxValues, chunk.length))
        .addOptions(chunk),
    ));
}

function buttonEmojiToText(emojiValue) {
  if (!emojiValue) return '💸';
  if (typeof emojiValue === 'string') return emojiValue;
  if (emojiValue?.id && emojiValue?.name) return `<${emojiValue.animated ? 'a' : ''}:${emojiValue.name}:${emojiValue.id}>`;
  if (emojiValue?.name) return emojiValue.name;
  return '💸';
}

function getReportCooldownKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getReportCooldownRemainingMs(guildId, userId, now = Date.now()) {
  const key = getReportCooldownKey(guildId, userId);
  const last = reportCooldowns.get(key) ?? 0;
  return Math.max(0, (last + REPORT_COOLDOWN_MS) - now);
}

function touchReportCooldown(guildId, userId, now = Date.now()) {
  reportCooldowns.set(getReportCooldownKey(guildId, userId), now);
}

function queueReportInboxUpdate(guildId, userId, status, details = '') {
  if (!guildId || !userId) return;
  const baseByStatus = {
    submitted: 'Your message report was submitted to moderators.',
    dismissed: 'Your message report was reviewed and dismissed.',
    action_taken: 'Your message report was reviewed and action was taken.',
  };
  economy.addPendingMessage(guildId, userId, {
    type: 'staff_message',
    from: 'Moderation Team',
    message: `${baseByStatus[status] ?? 'Your message report was updated.'}${details ? `\n\n${details}` : ''}`.slice(0, 500),
  });
}

function buildReportActionCustomId(action, sourceMessageId, reporterId) {
  const actionCode = REPORT_ACTION_CODE_BY_ACTION[action];
  if (!actionCode || !sourceMessageId) return null;
  return `ra:${actionCode}:${sourceMessageId}:${reporterId ?? ''}`;
}

function parseReportActionCustomId(customId) {
  if (customId.startsWith('ra:')) {
    const [, actionCode, messageId, reporterId = ''] = customId.split(':');
    const action = REPORT_ACTION_BY_CODE[actionCode];
    if (!action || !messageId) return null;
    return {
      action,
      messageId,
      reporterId,
      sourceChannelId: null,
      authorId: null,
    };
  }
  if (customId.startsWith('report_action:')) {
    const [, action, sourceChannelId, messageId, authorId, reporterId = ''] = customId.split(':');
    if (!action || !messageId) return null;
    return {
      action,
      messageId,
      reporterId,
      sourceChannelId: sourceChannelId ?? null,
      authorId: authorId ?? null,
    };
  }
  return null;
}

function getEmbedFieldValue(embed, fieldName) {
  return embed?.fields?.find((field) => field?.name === fieldName)?.value ?? '';
}

function parseSourceContextFromJumpLink(jumpLink) {
  const match = String(jumpLink ?? '').match(/\/channels\/\d+\/(\d+)\/(\d+)/);
  if (!match) return null;
  return {
    sourceChannelId: match[1],
    messageId: match[2],
  };
}

function parseMentionUserId(value) {
  const match = String(value ?? '').match(/<@!?(\d+)>/);
  return match?.[1] ?? null;
}

async function tryDeferReplyEphemeral(interaction) {
  return interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
}

async function tryDeferUpdate(interaction) {
  return interaction.deferUpdate().catch(() => null);
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      if (interaction.guildId && interaction.user?.id) {
        const roleCache = interaction.member?.roles?.cache;
        const roleIds = Array.isArray(interaction.member?.roles) ? interaction.member.roles : null;
        const hasBoosterRole = roleCache?.has(SERVER_BOOSTER_ROLE_ID)
          ?? (roleIds ? roleIds.includes(SERVER_BOOSTER_ROLE_ID) : null);
        if (typeof hasBoosterRole === 'boolean') {
          economy.setUserBoosterStatus(interaction.guildId, interaction.user.id, hasBoosterRole);
        }
        const hasVcfProfileTag = economy.inferVcfProfileTagStatus(interaction.member, interaction.user);
        economy.setUserVcfTagStatus(interaction.guildId, interaction.user.id, hasVcfProfileTag);
      }
      if (interaction.isButton() || interaction.isStringSelectMenu()) {
      if (isComponentExpired(interaction)) {
        return interaction.reply({
          embeds: [embeds.warning('This component has expired. Run the command again to refresh.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (interaction.customId.startsWith('bake_golden_claim:')) {
        const [, ownerId, token] = interaction.customId.split(':');
        if (ownerId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('That Golden Cookie belongs to someone else, crumb thief.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const result = economy.claimGoldenCookie(interaction.guild.id, interaction.user.id, token);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          embeds: [embeds.success(result.description, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('updates_nav:')) {
        const parts = interaction.customId.split(':');
        const action = parts[1];
        const current = Number.parseInt(parts[2] ?? '0', 10) || 0;
        let newIndex = current;
        if (action === 'latest') newIndex = 0;
        else if (action === 'oldest') newIndex = UPDATE_LOGS.length - 1;
        else if (action === 'prev') newIndex = Math.max(0, current - 1);
        else if (action === 'next') newIndex = Math.min(UPDATE_LOGS.length - 1, current + 1);
        const updatesCommand = require('../commands/utility/updates');
        return interaction.update(updatesCommand.buildUpdatesResponse(interaction.guild, newIndex));
      }

      if (
        interaction.isButton()
        && (
          interaction.customId.startsWith('aimanage_back:')
          || interaction.customId.startsWith('aimanage_refresh:')
          || interaction.customId.startsWith('aimanage_close:')
          || interaction.customId.startsWith('aimanage_refresh_user:')
          || interaction.customId.startsWith('aimanage_refresh_role:')
          || interaction.customId.startsWith('aimanage_u_btn:')
          || interaction.customId.startsWith('aimanage_r_btn:')
        )
      ) {
        const parts = interaction.customId.split(':');
        const kind = parts[0];
        const actorId = parts[1];
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!aiManageCommand.canManageAiUsage(interaction.member)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have permission to manage AI usage.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        // Back / Refresh / Close
        if (kind === 'aimanage_back' || kind === 'aimanage_refresh') {
          await interaction.deferUpdate().catch(() => null);
          return interaction.editReply({
            embeds: [aiManageCommand.buildPanelEmbed(interaction.guild)],
            components: aiManageCommand.buildPanelComponents(actorId),
          });
        }
        if (kind === 'aimanage_close') {
          await interaction.deferUpdate().catch(() => null);
          return interaction.deleteReply().catch(() => null);
        }
        if (kind === 'aimanage_refresh_user') {
          const targetId = parts[2];
          await interaction.deferUpdate().catch(() => null);
          const member = await interaction.guild.members.fetch(targetId).catch(() => null);
          const data = aiManageCommand.readUsage();
          const info = aiManageCommand.resolveUserEffective(data, member, targetId);
          return interaction.editReply({
            embeds: [aiManageCommand.buildUserCardEmbed(interaction.guild, member, targetId)],
            components: aiManageCommand.buildUserCardComponents(actorId, targetId, info),
          });
        }
        if (kind === 'aimanage_refresh_role') {
          const roleId = parts[2];
          await interaction.deferUpdate().catch(() => null);
          const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
          if (!role) {
            return interaction.editReply({
              embeds: [embeds.error('Role not found.', interaction.guild)],
              components: aiManageCommand.buildPanelComponents(actorId),
            });
          }
          const data = aiManageCommand.readUsage();
          const info = aiManageCommand.resolveRoleEffective(data, role);
          return interaction.editReply({
            embeds: [aiManageCommand.buildRoleCardEmbed(interaction.guild, role)],
            components: aiManageCommand.buildRoleCardComponents(actorId, roleId, info),
          });
        }

        // User card buttons
        if (kind === 'aimanage_u_btn') {
          const targetId = parts[2];
          const action = parts[3];
          if (action === 'set' || action === 'grant') {
            const isSet = action === 'set';
            return interaction.showModal(
              new ModalBuilder()
                .setCustomId(`aimanage_value_modal:${actorId}:${isSet ? 'set-user' : 'grant-user'}:${targetId}`)
                .setTitle(isSet ? 'Set User AI Limit' : 'Grant User Adjustment')
                .addComponents(
                  new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                      .setCustomId('value')
                      .setLabel(isSet ? 'Limit per 6h (use -1 for unlimited)' : 'Adjustment (positive = grant)')
                      .setStyle(TextInputStyle.Short)
                      .setRequired(true)
                      .setMaxLength(10)
                      .setPlaceholder(isSet ? 'e.g. 30 or -1' : 'e.g. 5'),
                  ),
                ),
            );
          }
          await interaction.deferUpdate().catch(() => null);
          if (action === 'clear') {
            aiManageCommand.writeUsage((data) => { delete data.userOverrides[targetId]; });
          } else if (action === 'reset_usage') {
            aiManageCommand.writeUsage((data) => { delete data.usage[targetId]; });
          } else if (action === 'safety_on') {
            aiManageCommand.writeUsage((data) => { data.safetyToggleUsers[targetId] = true; });
          } else if (action === 'safety_off') {
            aiManageCommand.writeUsage((data) => { delete data.safetyToggleUsers[targetId]; });
          } else if (action === 'dr_on') {
            aiManageCommand.writeUsage((data) => { data.deepResearchUsers[targetId] = true; });
          } else if (action === 'dr_off') {
            aiManageCommand.writeUsage((data) => { delete data.deepResearchUsers[targetId]; });
          } else {
            return interaction.editReply({
              embeds: [embeds.error('Unknown user action.', interaction.guild)],
            });
          }
          const member = await interaction.guild.members.fetch(targetId).catch(() => null);
          const data = aiManageCommand.readUsage();
          const info = aiManageCommand.resolveUserEffective(data, member, targetId);
          return interaction.editReply({
            embeds: [aiManageCommand.buildUserCardEmbed(interaction.guild, member, targetId)],
            components: aiManageCommand.buildUserCardComponents(actorId, targetId, info),
          });
        }

        // Role card buttons
        if (kind === 'aimanage_r_btn') {
          const roleId = parts[2];
          const action = parts[3];
          if (action === 'set' || action === 'grant') {
            const isSet = action === 'set';
            return interaction.showModal(
              new ModalBuilder()
                .setCustomId(`aimanage_value_modal:${actorId}:${isSet ? 'set-role' : 'grant-role'}:${roleId}`)
                .setTitle(isSet ? 'Set Role AI Limit' : 'Grant Role Adjustment')
                .addComponents(
                  new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                      .setCustomId('value')
                      .setLabel(isSet ? 'Limit per 6h (use -1 for unlimited)' : 'Adjustment (positive = grant)')
                      .setStyle(TextInputStyle.Short)
                      .setRequired(true)
                      .setMaxLength(10)
                      .setPlaceholder(isSet ? 'e.g. 30 or -1' : 'e.g. 5'),
                  ),
                ),
            );
          }
          await interaction.deferUpdate().catch(() => null);
          if (action === 'clear') {
            aiManageCommand.writeUsage((data) => { delete data.roleOverrides[roleId]; });
          } else {
            return interaction.editReply({
              embeds: [embeds.error('Unknown role action.', interaction.guild)],
            });
          }
          const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
          if (!role) {
            return interaction.editReply({
              embeds: [embeds.error('Role not found.', interaction.guild)],
              components: aiManageCommand.buildPanelComponents(actorId),
            });
          }
          const data = aiManageCommand.readUsage();
          const info = aiManageCommand.resolveRoleEffective(data, role);
          return interaction.editReply({
            embeds: [aiManageCommand.buildRoleCardEmbed(interaction.guild, role)],
            components: aiManageCommand.buildRoleCardComponents(actorId, roleId, info),
          });
        }
      }

      if (interaction.customId.startsWith('ctx_mod_')) {
        if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
          return interaction.reply({
            embeds: [embeds.error('You no longer have permission to use this moderation panel.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const [, actionWithTarget] = interaction.customId.split('ctx_mod_');
        const [action, targetId] = actionWithTarget.split(':');
        await tryDeferReplyEphemeral(interaction);
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!member) {
          return interaction.editReply({
            embeds: [embeds.error('That user is no longer in this server.', interaction.guild)],
          });
        }
        if (action === 'warn') {
          const reason = 'Quick moderation panel warning.';
          db.addWarning(interaction.guild.id, targetId, {
            moderatorId: interaction.user.id,
            reason,
          });
          await sendModerationActionDm({
            user: member.user,
            guild: interaction.guild,
            action: 'Warning',
            reason,
            moderatorTag: interaction.user.tag,
          });
          return interaction.editReply({
            embeds: [embeds.success(`Warned <@${targetId}>.`, interaction.guild)],
          });
        }
        if (action === 'timeout5m' || action === 'timeout1h') {
          const durationMs = action === 'timeout5m' ? 5 * 60_000 : 60 * 60_000;
          const reason = 'Quick moderation panel timeout.';
          await sendModerationActionDm({
            user: member.user,
            guild: interaction.guild,
            action: 'Timeout',
            reason,
            moderatorTag: interaction.user.tag,
            duration: `${Math.floor(durationMs / 60_000)} minutes`,
          });
          const ok = await member.timeout(durationMs, `${interaction.user.tag}: quick moderation panel`)
            .then(() => true)
            .catch(() => false);
          if (!ok) {
            return interaction.editReply({
              embeds: [embeds.error('Failed to timeout user (permissions or hierarchy).', interaction.guild)],
            });
          }
          return interaction.editReply({
            embeds: [embeds.success(`Timed out <@${targetId}> for **${Math.floor(durationMs / 60_000)}m**.`, interaction.guild)],
          });
        }
        if (action === 'kick') {
          const reason = 'Quick moderation panel kick.';
          await sendModerationActionDm({
            user: member.user,
            guild: interaction.guild,
            action: 'Kick',
            reason,
            moderatorTag: interaction.user.tag,
          });
          const ok = await member.kick(`${interaction.user.tag}: quick moderation panel`)
            .then(() => true)
            .catch(() => false);
          if (!ok) {
            return interaction.editReply({
              embeds: [embeds.error('Failed to kick user (permissions or hierarchy).', interaction.guild)],
            });
          }
          return interaction.editReply({
            embeds: [embeds.success(`Kicked <@${targetId}>.`, interaction.guild)],
          });
        }
        if (action === 'ban') {
          const reason = 'Quick moderation panel ban.';
          await sendModerationActionDm({
            user: member.user,
            guild: interaction.guild,
            action: 'Ban',
            reason,
            moderatorTag: interaction.user.tag,
          });
          const ok = await interaction.guild.members
            .ban(targetId, { reason: `${interaction.user.tag}: quick moderation panel` })
            .then(() => true)
            .catch(() => false);
          if (!ok) {
            return interaction.editReply({
              embeds: [embeds.error('Failed to ban user (permissions or hierarchy).', interaction.guild)],
            });
          }
          return interaction.editReply({
            embeds: [embeds.success(`Banned <@${targetId}>.`, interaction.guild)],
          });
        }
      }

      if (interaction.customId.startsWith('report_action:') || interaction.customId.startsWith('ra:')) {
        if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
          return interaction.reply({
            embeds: [embeds.error('Only moderation staff can use report actions.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const parsedAction = parseReportActionCustomId(interaction.customId);
        if (!parsedAction) {
          return interaction.reply({
            embeds: [embeds.error('Invalid report action payload.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        let {
          action,
          sourceChannelId,
          messageId,
          authorId,
          reporterId,
        } = parsedAction;
        if (!sourceChannelId || !authorId) {
          const reportEmbed = interaction.message?.embeds?.[0];
          const jumpLink = getEmbedFieldValue(reportEmbed, 'Jump Link');
          const linkContext = parseSourceContextFromJumpLink(jumpLink);
          sourceChannelId = sourceChannelId ?? linkContext?.sourceChannelId ?? null;
          messageId = messageId ?? linkContext?.messageId ?? null;
          authorId = authorId ?? parseMentionUserId(getEmbedFieldValue(reportEmbed, 'Author'));
        }
        if (!sourceChannelId || !messageId || !authorId) {
          return interaction.reply({
            embeds: [embeds.error('Could not resolve source message details for this report.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'dismiss') {
          const modal = new ModalBuilder()
            .setCustomId(`report_dismiss_reason:${interaction.message.id}:${reporterId ?? ''}`)
            .setTitle('Dismiss Report')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('reason')
                  .setLabel('Dismissal reason')
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(true)
                  .setMaxLength(500),
              ),
            );
          return interaction.showModal(modal);
        }
        if (action === 'warn_author') {
          const modal = new ModalBuilder()
            .setCustomId(`${REPORT_WARN_MODAL_PREFIX}${interaction.message.id}:${sourceChannelId}:${messageId}:${authorId}:${reporterId ?? ''}`)
            .setTitle('Warn Author')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('reason')
                  .setLabel('Reason for warning')
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(true)
                  .setMaxLength(500),
              ),
            );
          return interaction.showModal(modal);
        }
        if (action === 'timeout_author') {
          const modal = new ModalBuilder()
            .setCustomId(`${REPORT_TIMEOUT_MODAL_PREFIX}${interaction.message.id}:${sourceChannelId}:${messageId}:${authorId}:${reporterId ?? ''}`)
            .setTitle('Timeout Author')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('reason')
                  .setLabel('Reason for timeout')
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(true)
                  .setMaxLength(500),
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('duration')
                  .setLabel('Duration (e.g. 1h, 30m, 1d — default 1h)')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(false)
                  .setMaxLength(20),
              ),
            );
          return interaction.showModal(modal);
        }
        await tryDeferReplyEphemeral(interaction);
        const targetChannel = await interaction.guild.channels.fetch(sourceChannelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) {
          return interaction.editReply({
            embeds: [embeds.error('Source channel is unavailable for this report.', interaction.guild)],
          });
        }
        const targetMessage = await targetChannel.messages.fetch(messageId).catch(() => null);
        if (action === 'delete_message' && targetMessage) {
          const deletedContent = (targetMessage.content ?? '(message unavailable)').slice(0, 900);
          await targetMessage.delete().catch(() => null);
          await sendCommandLog({
            guild: interaction.guild,
            moderator: interaction.user,
            action: 'Delete Message (Report)',
            target: `<@${authorId}> in <#${sourceChannelId}>`,
            details: `Message deleted from report queue.\n\nContent:\n\`\`\`\n${deletedContent}\n\`\`\``,
          });
          if (reporterId) {
            queueReportInboxUpdate(interaction.guild.id, reporterId, 'action_taken');
          }
          return interaction.editReply({ embeds: [embeds.success('Reported message deleted.', interaction.guild)] });
        }
      }

      if (allianceCommand.isAllianceAdJoinButtonCustomId(interaction.customId)) {
        return allianceCommand.handleAllianceAdJoinButton(interaction);
      }

      const ownerId = getComponentOwnerId(interaction);
      if (ownerId && ownerId !== interaction.user.id) {
        return interaction.reply({
          embeds: [embeds.error('These buttons belong to someone else\'s command.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (allianceCommand.isAllianceButtonCustomId(interaction.customId)) {
        return allianceCommand.handleAllianceButton(interaction);
      }

      if (interaction.customId === 'messages_open_select') {
        const messageId = String(interaction.values?.[0] ?? '');
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildOpenedMessageEmbed(interaction.guild, snapshot.user, messageId);
        const components = economy.buildOpenedMessageComponents(snapshot.user, messageId);
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('messages_open:')) {
        const messageId = String(interaction.customId.split(':')[1] ?? '');
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildOpenedMessageEmbed(interaction.guild, snapshot.user, messageId);
        const components = economy.buildOpenedMessageComponents(snapshot.user, messageId);
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId === 'messages_open_back') {
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildMessagesEmbed(interaction.guild, snapshot.user, 0);
        const components = economy.buildMessagesComponents(snapshot.user, 0);
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('messages_open_claim:')) {
        const messageId = Number.parseInt(interaction.customId.split(':')[1], 10);
        const result = economy.claimPendingMessage(interaction.guild.id, interaction.user.id, messageId, null);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildMessagesEmbed(interaction.guild, snapshot.user, 0);
        const components = economy.buildMessagesComponents(snapshot.user, 0);
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('messages_open_delete:')) {
        const messageId = Number.parseInt(interaction.customId.split(':')[1], 10);
        economy.deletePendingMessage(interaction.guild.id, interaction.user.id, messageId, null);
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildMessagesEmbed(interaction.guild, snapshot.user, 0);
        const components = economy.buildMessagesComponents(snapshot.user, 0);
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('messages_page:')) {
        const pageNum = Number.parseInt(interaction.customId.split(':')[1], 10) || 0;
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildMessagesEmbed(interaction.guild, snapshot.user, pageNum);
        const components = economy.buildMessagesComponents(snapshot.user, pageNum);
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('messages_claim:')) {
        const parts = interaction.customId.split(':');
        const currentPage = Number.parseInt(parts[1], 10) || 0;
        const globalIndex = Number.parseInt(parts[2], 10);
        const result = economy.claimPendingMessage(interaction.guild.id, interaction.user.id, globalIndex);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        let replyText = '✓ Reward claimed!';
        if (result.type === 'gift_box') {
          const box = economy.REWARD_BOXES.find((b) => b.id === result.reward.rewardBoxId);
          replyText = `✓ Claimed **${result.reward.quantity}x ${box?.name ?? result.reward.rewardBoxId}** — open it from your bakery inventory!`;
        } else if (result.type === 'gift_cookies') {
          replyText = `✓ Claimed **${economy.toCookieNumber(result.reward.cookieAmount)}** cookies!`;
        } else if (result.type === 'rank_reward') {
          const rewardSummary = economy.formatRankReward({ rewards: result.reward.rewards ?? {} });
          replyText = `✓ Claimed rank reward for **${result.reward.rankName ?? 'Unknown rank'}**!\n${rewardSummary}`;
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildMessagesEmbed(interaction.guild, snapshot.user, currentPage);
        const components = economy.buildMessagesComponents(snapshot.user, currentPage);
        embed.addFields({ name: 'Claimed', value: replyText });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('messages_delete:')) {
        const parts = interaction.customId.split(':');
        const currentPage = Number.parseInt(parts[1], 10) || 0;
        const globalIndex = Number.parseInt(parts[2], 10);
        economy.deletePendingMessage(interaction.guild.id, interaction.user.id, globalIndex);
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildMessagesEmbed(interaction.guild, snapshot.user, currentPage);
        const components = economy.buildMessagesComponents(snapshot.user, currentPage);
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_nav:')) {
        const requestedView = interaction.customId.split(':')[1];
        const view = requestedView === 'codex' ? 'guide' : requestedView;
        let viewOptions = {};
        if (view === 'guide') viewOptions = getGuideState(interaction.guild.id, interaction.user.id);
        if (view === 'leaderboard') viewOptions = { metric: 'cookies' };
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, view, viewOptions);
        const components = economy.buildDashboardComponents(snapshot.user, view, { guild: interaction.guild, ...viewOptions });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_gift_sell_all:')) {
        const [, rewardBoxId, token] = interaction.customId.split(':');
        const pendingSell = token ? popPendingGiftQuickSellSelection(interaction.guild.id, interaction.user.id, token) : null;
        if (!pendingSell || pendingSell.rewardBoxId !== rewardBoxId) {
          return interaction.reply({
            embeds: [embeds.warning('Quick sell expired or invalid for this gift opening. Open a gift box again to quick-sell its drops.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        let totalEarned = 0;
        let itemsSold = 0;
        for (const [itemId, quantity] of Object.entries(pendingSell.dropQuantities ?? {})) {
          const result = economy.sellInventoryItemQuantity(interaction.guild.id, interaction.user.id, itemId, quantity);
          if (result.ok) {
            totalEarned += result.value ?? 0;
            itemsSold += result.amount ?? 0;
          }
        }
        if (itemsSold <= 0) {
          return interaction.reply({
            embeds: [embeds.warning('No sellable drops from that gift opening were found in your inventory.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          embeds: [
            embeds.success(`Sold **${economy.toCookieNumber(itemsSold)}** item(s) from that gift opening for **${economy.toCookieNumber(totalEarned)}** cookies.`, interaction.guild),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'bake_again') {
        if (economy.isUserBakeBanned(interaction.guild.id, interaction.user.id)) {
          return interaction.reply({
            embeds: [embeds.warning('You are banned from baking commands in this server.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const outcome = bakeCommand.buildBakeOutcome(interaction.guild, interaction.user.id);
        await interaction.update(outcome.reply);
        if (outcome.specialCookieEvent) {
          await bakeCommand.postSpecialCookieEvent(interaction.guild, interaction.user, outcome.specialCookieEvent);
        }
        return;
      }

      if (interaction.customId.startsWith('bakery_guide_prev:') || interaction.customId.startsWith('bakery_guide_next:')) {
        const [, section, currentPageRaw] = interaction.customId.split(':');
        const currentPage = Number.parseInt(currentPageRaw, 10) || 0;
        const targetPage = interaction.customId.startsWith('bakery_guide_prev:') ? currentPage - 1 : currentPage + 1;
        setGuideState(interaction.guild.id, interaction.user.id, section, targetPage);
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'guide', { section, page: targetPage });
        const components = economy.buildDashboardComponents(snapshot.user, 'guide', { section, page: targetPage, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_codex_prev:') || interaction.customId.startsWith('bakery_codex_next:')) {
        const currentPage = Number.parseInt(interaction.customId.split(':')[1], 10) || 0;
        const targetPage = interaction.customId.startsWith('bakery_codex_prev:') ? currentPage - 1 : currentPage + 1;
        setGuideState(interaction.guild.id, interaction.user.id, 'cookies', targetPage);
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'guide', { section: 'cookies', page: targetPage });
        const components = economy.buildDashboardComponents(snapshot.user, 'guide', { section: 'cookies', page: targetPage, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_achievements_prev:') || interaction.customId.startsWith('bakery_achievements_next:')) {
        const currentPage = Number.parseInt(interaction.customId.split(':')[1], 10) || 0;
        const targetPage = interaction.customId.startsWith('bakery_achievements_prev:') ? currentPage - 1 : currentPage + 1;
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'achievements', { page: targetPage });
        const components = economy.buildDashboardComponents(snapshot.user, 'achievements', { page: targetPage, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_inventory_prev:') || interaction.customId.startsWith('bakery_inventory_next:')) {
        const [, currentPageRaw, rarityFilterRaw] = interaction.customId.split(':');
        const currentPage = Number.parseInt(currentPageRaw, 10) || 0;
        const rarityFilter = rarityFilterRaw || 'all';
        const targetPage = interaction.customId.startsWith('bakery_inventory_prev:') ? currentPage - 1 : currentPage + 1;
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'inventory', { page: targetPage, rarityFilter });
        const components = economy.buildDashboardComponents(snapshot.user, 'inventory', { page: targetPage, rarityFilter, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId === 'bakery_open_marketplace') {
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const market = economy.getMarketplaceEmbed(interaction.guild, snapshot.guildState, snapshot.user, 0, 'all');
        const components = economy.getMarketplaceComponents(snapshot.guildState, 0, 'all');
        return interaction.update({ embeds: [market.embed], components });
      }

      if (interaction.customId === 'bakery_cps_breakdown') {
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const breakdownEmbed = economy.buildCpsBreakdownEmbed(interaction.guild, snapshot.user);
        return interaction.reply({ embeds: [breakdownEmbed], flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === 'bakery_set_name') {
        return interaction.showModal(economy.modalForBakeryName());
      }

      if (interaction.customId === 'bakery_set_listing' || interaction.customId === 'market_list_item') {
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const itemOptions = buildInventoryItemSelectOptions(snapshot.user, interaction.guild);
        if (itemOptions.length === 0) {
          return interaction.reply({
            embeds: [embeds.warning('You have no inventory items to list.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          embeds: [embeds.info('List Item', 'Select an inventory item to list.', interaction.guild)],
          components: [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('market_list_item_select')
                .setPlaceholder('Select an item')
                .addOptions(itemOptions),
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakery_build_buy:')) {
        const [, buildingId, qtyRaw] = interaction.customId.split(':');
        const quantity = Number.parseInt(qtyRaw, 10);
        const result = economy.buyBuilding(interaction.guild.id, interaction.user.id, buildingId, quantity);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'buildings', { buildingId });
        const components = economy.buildDashboardComponents(snapshot.user, 'buildings', { buildingId, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_build_sell:')) {
        const [, buildingId, qtyRaw] = interaction.customId.split(':');
        const quantity = Number.parseInt(qtyRaw, 10);
        const result = economy.sellBuilding(interaction.guild.id, interaction.user.id, buildingId, quantity);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'buildings', { buildingId });
        const components = economy.buildDashboardComponents(snapshot.user, 'buildings', { buildingId, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_upgrade_buy:')) {
        const upgradeId = interaction.customId.split(':')[1];
        const result = economy.buyUpgrade(interaction.guild.id, interaction.user.id, upgradeId);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'upgrades', { upgradeId });
        const components = economy.buildDashboardComponents(snapshot.user, 'upgrades', { upgradeId, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_upgrade_sell:')) {
        const upgradeId = interaction.customId.split(':')[1];
        const result = economy.sellUpgrade(interaction.guild.id, interaction.user.id, upgradeId);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'upgrades', { upgradeId });
        const components = economy.buildDashboardComponents(snapshot.user, 'upgrades', { upgradeId, guild: interaction.guild });
        embed.addFields({
          name: `${buttonEmojiToText(economy.getButtonEmoji(interaction.guild, ['Paid_in_full', 'sell'], '💸'))} Upgrade Sold`,
          value: `Sold **${result.upgrade.name}** for **${economy.toCookieNumber(result.refund)}** cookies (−30% of original cost).`,
        });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_item_action:')) {
        const [, action, itemId] = interaction.customId.split(':');
        let result = null;
        if (action === 'sell') result = economy.sellInventoryItem(interaction.guild.id, interaction.user.id, itemId, false);
        if (action === 'sellall') result = economy.sellInventoryItem(interaction.guild.id, interaction.user.id, itemId, true);
        if (action === 'consume') result = economy.consumeInventoryItem(interaction.guild.id, interaction.user.id, itemId);
        if (action === 'inspect') {
          const details = economy.inspectItem(interaction.guild.id, interaction.user.id, itemId);
          if (!details) {
            return interaction.reply({
              embeds: [embeds.error('Could not inspect that item.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          return interaction.reply({
            embeds: [economy.buildItemInspectEmbed(interaction.guild, details)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!result?.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result?.reason ?? 'Could not process item action.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const dashboard = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'inventory');
        const components = economy.buildDashboardComponents(snapshot.user, 'inventory', { guild: interaction.guild });
        return interaction.update({ embeds: [dashboard], components });
      }

      if (interaction.customId.startsWith('market_prev:') || interaction.customId.startsWith('market_next:')) {
        const [, pageRaw, rarityFilter] = interaction.customId.split(':');
        const currentPage = Number.parseInt(pageRaw, 10) || 0;
        const targetPage = interaction.customId.startsWith('market_prev:') ? currentPage - 1 : currentPage + 1;
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const market = economy.getMarketplaceEmbed(interaction.guild, snapshot.guildState, snapshot.user, targetPage, rarityFilter || 'all');
        const components = economy.getMarketplaceComponents(snapshot.guildState, market.pageIndex, rarityFilter || 'all');
        return interaction.update({ embeds: [market.embed], components });
      }

      if (interaction.customId === 'market_my_listings') {
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const mine = (snapshot.guildState.marketplace.listings ?? []).filter((listing) => listing.sellerId === interaction.user.id);
        if (!mine.length) {
          return interaction.reply({
            embeds: [embeds.info('My Listings', 'You have no active listings.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const listEmbed = embeds.info(
          'My Listings',
          mine.slice(0, 10).map((listing) => `\`${listing.id}\` • ${economy.ITEM_MAP.get(listing.itemId)?.name ?? listing.itemId} x${listing.quantity} @ ${economy.toCookieNumber(listing.pricePerUnit)}`).join('\n'),
          interaction.guild,
        );
        const row = new ActionRowBuilder().addComponents(
          mine.slice(0, 5).map((listing) => new ButtonBuilder()
            .setCustomId(`market_cancel:${listing.id}`)
            .setLabel(`Cancel #${listing.id}`)
            .setStyle(ButtonStyle.Danger)),
        );
        return interaction.reply({ embeds: [listEmbed], components: [row], flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === 'market_back_bakery') {
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'home');
        const components = economy.buildDashboardComponents(snapshot.user, 'home', { guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('market_cancel:')) {
        const listingId = Number.parseInt(interaction.customId.split(':')[1], 10);
        const result = economy.cancelListing(interaction.guild.id, interaction.user.id, listingId);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          embeds: [embeds.success(`Listing #${listingId} cancelled and returned to inventory.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakeadmin_view_refresh:')) {
        const targetUserId = interaction.customId.split(':')[1];
        const embed = economy.getUserDataEmbed(interaction.guild, targetUserId);
        return interaction.update({ embeds: [embed] });
      }

      if (interaction.customId.startsWith('bakeadmin_global_action:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const action = interaction.values[0];
        if (action === 'refresh_dashboard') {
          const dashboardEmbed = economy.buildBakeAdminDashboardEmbed(interaction.guild, actorId);
          const dashboardComponents = economy.buildBakeAdminDashboardComponents(actorId);
          return interaction.update({ embeds: [dashboardEmbed], components: dashboardComponents });
        }
        if (action === 'set_log_channel') {
          return interaction.reply({
            embeds: [embeds.info('Set Log Channel', 'Choose the bake admin log channel.', interaction.guild)],
            components: [
              new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                  .setCustomId(`bakeadmin_global_log_channel_select:${actorId}`)
                  .setPlaceholder('Select a channel')
                  .setMinValues(1)
                  .setMaxValues(1),
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'start_event') {
          return interaction.reply({
            embeds: [embeds.info('Start Bake Event', 'Choose the type of event to start.', interaction.guild)],
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`bakeadmin_event_type_select:${actorId}`)
                  .setPlaceholder('Select event type')
                  .addOptions(economy.COOKIE_EVENT_DEFINITIONS.map((eventDef) => {
                    const eventEmojis = {
                      special_cookie_hunt: '-',
                      golden_fever: '-',
                      sugar_rush: '-',
                      steady_heat: '🔥',
                    };
                    return {
                      label: eventDef.name,
                      value: eventDef.id,
                      description: eventDef.description.slice(0, 100),
                      emoji: eventEmojis[eventDef.id] ?? '🎉',
                    };
                  })),
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'force_rotate_challenges') {
          const bakeryRotation = challenges.adminForceRotateGuildChallenges(interaction.guild.id, Date.now());
          const allianceRotation = alliances.adminForceRotateAllianceChallenges(interaction.guild.id, Date.now());
          await tryDeferReplyEphemeral(interaction);
          await sendBakeAdminLog(
            interaction,
            actorId,
            'Global: Force Rotate Challenges',
            `Bakery daily=${bakeryRotation.daily.name} weekly=${bakeryRotation.weekly.name} | Alliance rotated=${allianceRotation?.rotated?.length ?? 0}`,
          );
          const eventsChannel = await interaction.guild.channels.fetch(SPECIAL_COOKIE_EVENT_CHANNEL_ID).catch(() => null);
          if (eventsChannel?.isTextBased()) {
            const allianceCount = allianceRotation?.rotated?.length ?? 0;
            await eventsChannel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x5865f2)
                  .setTitle('🎯 Challenges Rotated by Bake Admin')
                  .setDescription([
                    `Triggered by <@${interaction.user.id}>`,
                    `Daily: **${bakeryRotation.daily.name}**`,
                    `Weekly: **${bakeryRotation.weekly.name}**`,
                    `Alliance quests rotated: **${allianceCount}**`,
                  ].join('\n'))
                  .setTimestamp(),
              ],
            }).catch(() => null);
          }
          return interaction.editReply({
            embeds: [embeds.success(
              `Challenges rotated.\nDaily: **${bakeryRotation.daily.name}**\nWeekly: **${bakeryRotation.weekly.name}**\nAlliance quests rotated: **${allianceRotation?.rotated?.length ?? 0}**`,
              interaction.guild,
            )],
          });
        }
        if (action === 'gift_all_users') {
          return interaction.reply({
            embeds: [embeds.info('Gift All Users', 'Select the reward gift box to send to every tracked user.', interaction.guild)],
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`bakeadmin_gift_all_box_select:${actorId}`)
                  .setPlaceholder('Select a reward gift box')
                  .addOptions(economy.REWARD_BOXES.slice(0, 25).map((rewardBox) => ({
                    label: rewardBox.name.slice(0, 100),
                    value: rewardBox.id,
                    emoji: economy.getRewardBoxEmoji(rewardBox, interaction.guild),
                  }))),
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'reset_economy') {
          const modal = new ModalBuilder()
            .setCustomId(`bakeadmin_global_modal:${actorId}:reset_economy`)
            .setTitle('Reset Entire Bakery Economy')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('confirm')
                  .setLabel('Type RESET ALL to confirm')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
            );
          return interaction.showModal(modal);
        }
      }

      if (interaction.customId.startsWith('bakeadmin_alliance_action:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const action = interaction.values[0];
        if (!['alliance_add_upgrade', 'alliance_remove_upgrade', 'alliance_delete', 'alliance_add_points', 'alliance_take_points'].includes(action)) {
          return interaction.reply({
            embeds: [embeds.error('Unknown alliance management action.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const allianceOptions = alliances.listAlliances(interaction.guild.id)
          .map((alliance) => ({
            label: alliance.name.slice(0, 100),
            value: alliance.id,
            description: `ID ${alliance.id} • Members ${alliance.members.length}`.slice(0, 100),
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        if (!allianceOptions.length) {
          return interaction.reply({
            embeds: [embeds.warning('No alliances found to manage.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'alliance_delete') {
          const components = buildPagedStringSelectRows({
            customIdPrefix: `bakeadmin_alliance_delete_select:${actorId}:${actorId}`,
            placeholderBase: 'Select alliance to delete',
            options: allianceOptions,
          });
          return interaction.reply({
            embeds: [embeds.warning('Select an alliance, then confirm deletion in the next step.', interaction.guild)],
            components,
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'alliance_add_points' || action === 'alliance_take_points') {
          const mode = action === 'alliance_take_points' ? 'take' : 'add';
          const components = buildPagedStringSelectRows({
            customIdPrefix: `bakeadmin_alliance_points_alliance_select:${actorId}:${mode}`,
            placeholderBase: 'Select alliance',
            options: allianceOptions,
          });
          return interaction.reply({
            embeds: [embeds.info(
              action === 'alliance_add_points' ? 'Alliance: Add Points' : 'Alliance: Take Points',
              'Select the alliance to update points.',
              interaction.guild,
            )],
            components,
            flags: MessageFlags.Ephemeral,
          });
        }
        const mode = action === 'alliance_remove_upgrade' ? 'remove' : 'grant';
        const components = buildPagedStringSelectRows({
          customIdPrefix: `bakeadmin_alliance_upgrade_alliance_select:${actorId}:${actorId}:${mode}`,
          placeholderBase: 'Select alliance',
          options: allianceOptions,
        });
        return interaction.reply({
          embeds: [embeds.info(
            action === 'alliance_remove_upgrade' ? 'Alliance: Remove Upgrade' : 'Alliance: Grant Upgrade',
            'Select the alliance to update.',
            interaction.guild,
          )],
          components,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakeadmin_event_type_select:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const eventId = interaction.values[0];
        const eventDef = economy.COOKIE_EVENT_DEFINITIONS.find((e) => e.id === eventId);
        if (!eventDef) {
          return interaction.reply({
            embeds: [embeds.error('Unknown event type.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`bakeadmin_global_modal:${actorId}:start_event:${eventId}`)
          .setTitle(`Start ${eventDef.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('durationMinutes')
                .setLabel('Event duration (minutes)')
                .setPlaceholder('e.g. 30')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('bakeadmin_gift_all_box_select:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const rewardBoxId = interaction.values[0];
        const rewardBox = economy.REWARD_BOXES.find((entry) => entry.id === rewardBoxId);
        if (!rewardBox) {
          return interaction.reply({
            embeds: [embeds.error('Unknown reward gift box.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`bakeadmin_gift_all_modal:${actorId}:${rewardBoxId}`)
          .setTitle(`Gift All: ${rewardBox.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('quantity')
                .setLabel('Quantity per user')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('message')
                .setLabel('Gift message (required)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('bakeadmin_upgrade_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const upgradeId = interaction.values[0];
        const ok = economy.adminUnlockUpgrade(interaction.guild.id, targetId, upgradeId);
        if (!ok) {
          return interaction.reply({
            embeds: [embeds.error('Could not unlock that upgrade.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await tryDeferReplyEphemeral(interaction);
        await sendBakeAdminLog(interaction, targetId, 'Unlock Upgrade', `Upgrade: ${upgradeId}`);
        return interaction.editReply({
          embeds: [embeds.success(`Unlocked upgrade \`${upgradeId}\` for <@${targetId}>.`, interaction.guild)],
        });
      }

      if (interaction.customId.startsWith('bakeadmin_item_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const itemId = interaction.values[0];
        const item = economy.ITEM_MAP.get(itemId);
        if (!item) {
          return interaction.reply({
            embeds: [embeds.error('Invalid item selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`bakeadmin_item_quantity_modal:${actorId}:${targetId}:${itemId}`)
          .setTitle(`Give ${item.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('quantity')
                .setLabel('Quantity')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('bakeadmin_building_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const buildingId = interaction.values[0];
        const building = economy.BUILDINGS.find((entry) => entry.id === buildingId);
        if (!building) {
          return interaction.reply({
            embeds: [embeds.error('Invalid building selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`bakeadmin_building_count_modal:${actorId}:${targetId}:${buildingId}`)
          .setTitle(`Set ${building.name} Count`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('count')
                .setLabel('Count')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('bakeadmin_alliance_upgrade_alliance_select:')) {
        const [, actorId, targetId, mode = 'grant'] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const allianceId = interaction.values[0];
        const alliance = alliances.listAlliances(interaction.guild.id).find((entry) => entry.id === allianceId);
        if (!alliance) {
          return interaction.reply({
            embeds: [embeds.error('Unknown alliance selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const components = buildPagedStringSelectRows({
          customIdPrefix: mode === 'remove'
            ? `bakeadmin_alliance_upgrade_remove_select:${actorId}:${targetId}:${allianceId}`
            : `bakeadmin_alliance_upgrade_grant_select:${actorId}:${targetId}:${allianceId}`,
          placeholderBase: mode === 'remove' ? 'Select upgrade(s) to remove' : 'Select upgrade(s) to grant',
          minValues: 1,
          maxValues: 10,
          options: alliances.ALLIANCE_STORE_UPGRADES
            .map((upgrade) => ({
              label: upgrade.name.slice(0, 100),
              value: upgrade.id,
              description: truncateSelectDescription(`${upgrade.description} • Cost: ${upgrade.cost} credits`),
              emoji: economy.getButtonEmoji(interaction.guild, upgrade.emojiCandidates, upgrade.fallbackEmoji),
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        });
        return interaction.reply({
          embeds: [embeds.info(
            mode === 'remove' ? 'Alliance: Remove Upgrade' : 'Alliance: Grant Upgrade',
            `Selected alliance: **${alliance.name}** (\`${allianceId}\`).`,
            interaction.guild,
          )],
          components,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakeadmin_alliance_upgrade_grant_select:')) {
        const [, actorId, targetId, allianceId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const upgradeIds = [...new Set(interaction.values.map((value) => String(value).trim()).filter(Boolean))];
        const added = [];
        const skipped = [];
        for (const upgradeId of upgradeIds) {
          const result = alliances.adminGrantAllianceUpgrade(interaction.guild.id, allianceId, upgradeId);
          if (result.ok) {
            added.push(result.upgrade?.name ?? upgradeId);
            continue;
          }
          skipped.push(`${upgradeId}: ${result.reason}`);
        }
        if (!added.length) {
          return interaction.reply({
            embeds: [embeds.error(skipped[0] ?? 'Could not grant selected alliance upgrades.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const alliance = alliances.listAlliances(interaction.guild.id).find((entry) => entry.id === allianceId);
        await tryDeferReplyEphemeral(interaction);
        await sendBakeAdminLog(
          interaction,
          targetId,
          'Alliance: Grant Upgrade',
          `${alliance?.name ?? allianceId} (${allianceId}) -> ${added.join(', ')}${skipped.length ? ` | Skipped: ${skipped.join(' • ')}` : ''}`,
        );
        const summary = [
          `Granted **${added.length}** upgrade${added.length === 1 ? '' : 's'} to **${alliance?.name ?? allianceId}** (\`${allianceId}\`).`,
          `Added: ${added.map((name) => `**${name}**`).join(', ')}`,
          skipped.length ? `Skipped: ${skipped.join(' • ')}` : null,
        ].filter(Boolean).join('\n');
        return interaction.editReply({
          embeds: [embeds.success(summary.slice(0, 4096), interaction.guild)],
        });
      }

      if (interaction.customId.startsWith('bakeadmin_alliance_points_alliance_select:')) {
        const [, actorId, mode] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const allianceId = interaction.values[0];
        const alliance = alliances.listAlliances(interaction.guild.id).find((entry) => entry.id === allianceId);
        if (!alliance) {
          return interaction.reply({
            embeds: [embeds.error('Unknown alliance selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`bakeadmin_alliance_points_modal:${actorId}:${mode}:${alliance.id}`)
          .setTitle(mode === 'take' ? 'Alliance: Take Points' : 'Alliance: Add Points')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('amount')
                .setLabel(`Points to ${mode === 'take' ? 'remove' : 'add'}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('bakeadmin_alliance_upgrade_remove_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const allianceId = interaction.values[0];
        const alliance = alliances.listAlliances(interaction.guild.id).find((entry) => entry.id === allianceId);
        if (!alliance) {
          return interaction.reply({
            embeds: [embeds.error('Unknown alliance selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`bakeadmin_alliance_delete_modal:${actorId}:${targetId}:${alliance.id}`)
          .setTitle(`Delete ${alliance.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('confirm')
                .setLabel('Type DELETE to confirm')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('bakeadmin_achievement_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const achievementId = interaction.values[0];
        const ok = economy.adminGrantAchievement(interaction.guild.id, targetId, achievementId);
        if (!ok) {
          return interaction.reply({
            embeds: [embeds.error('Could not grant that achievement.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await tryDeferReplyEphemeral(interaction);
        await sendBakeAdminLog(interaction, targetId, 'Grant Achievement', `Achievement: ${achievementId}`);
        return interaction.editReply({
          embeds: [embeds.success(`Granted achievement \`${achievementId}\` to <@${targetId}>.`, interaction.guild)],
        });
      }

      if (interaction.customId.startsWith('bakeadmin_rank_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const rankId = interaction.values[0];
        const ok = economy.adminSetRank(interaction.guild.id, targetId, rankId);
        if (!ok) {
          return interaction.reply({
            embeds: [embeds.error('Could not set that rank.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const rank = economy.RANKS.find((entry) => entry.id === rankId);
        await tryDeferReplyEphemeral(interaction);
        await sendBakeAdminLog(interaction, targetId, 'Set Rank', `Rank: ${rankId}`);
        return interaction.editReply({
          embeds: [embeds.success(`Set rank for <@${targetId}> to ${economy.getRankEmoji(rank, interaction.guild)} **${rank?.name ?? rankId}**.`, interaction.guild)],
        });
      }

      if (interaction.customId.startsWith('bakeadmin_reward_box_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const rewardBoxId = interaction.values[0];
        const rewardBox = economy.REWARD_BOXES.find((entry) => entry.id === rewardBoxId);
        if (!rewardBox) {
          return interaction.reply({
            embeds: [embeds.error('Unknown reward gift box.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`bakeadmin_reward_box_modal:${actorId}:${targetId}:${rewardBoxId}`)
          .setTitle(`Grant ${rewardBox.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('quantity')
                .setLabel('Quantity')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('message')
                .setLabel('Gift message (required)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('amr_timeout:') || interaction.customId.startsWith('amr_dismiss:')) {
        if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
          return interaction.reply({
            embeds: [embeds.error('Only moderation staff can use AutoMod review actions.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        if (interaction.customId.startsWith('amr_dismiss:')) {
          await tryDeferReplyEphemeral(interaction);
          await interaction.editReply({ embeds: [embeds.success('AutoMod review dismissed.', interaction.guild)] });
          await interaction.message.edit({ components: [] }).catch(() => null);
          return;
        }

        const [, authorId, sourceChannelId, messageId] = interaction.customId.split(':');
        const modal = new ModalBuilder()
          .setCustomId(`${AUTOMOD_REVIEW_TIMEOUT_MODAL_PREFIX}${authorId}:${sourceChannelId}:${messageId}`)
          .setTitle('AutoMod Review Timeout')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Reason for timeout')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('duration')
                .setLabel('Duration (e.g. 15m, 1h, 1d)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(20),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('broadcastmsg_audience_select:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!broadcastMessageCommand.hasLeadManagement(interaction.member)) {
          return interaction.reply({
            embeds: [embeds.error('You need to be Lead Oversight or Management to use this command.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const audience = interaction.values[0];
        const audienceLabel = getBroadcastAudienceLabel(audience);
        const broadcastKind = audience === 'role:vai_access' ? 'dev' : 'standard';
        const modal = new ModalBuilder()
          .setCustomId(`broadcastmsg_compose:${actorId}:${audience}`)
          .setTitle('- Compose Broadcast')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Title')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100)
                .setPlaceholder('Announcement title'),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('message')
                .setLabel(`Message — to: ${audienceLabel}`)
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(2000)
                .setPlaceholder('Write your broadcast message here...'),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('staffmsg_type_select:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!staffMessageCommand.hasSeniorModPlus(interaction.member)) {
          return interaction.reply({
            embeds: [embeds.error('You need to be a Senior Moderator or above to use this command.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const type = interaction.values[0];
        const typeLabel = staffMessageCommand.MESSAGE_TYPES.find((t) => t.value === type)?.label ?? type;
        const modal = new ModalBuilder()
          .setCustomId(`staffmsg_message_modal:${actorId}:${type}`)
          .setTitle(`📨 Staff Message — ${typeLabel}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('message')
                .setLabel('Message Content')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(2000)
                .setPlaceholder('Write your message to the recipients...'),
            ),
          );
        return interaction.showModal(modal);
      }

      if (shiftCommand.isShiftPanelSelect(interaction.customId) && interaction.isStringSelectMenu()) {
        return shiftCommand.handleShiftPanelSelect(interaction);
      }

      if (helpCommand.isHelpCategorySelect(interaction.customId)) {
        return helpCommand.handleHelpCategorySelect(interaction);
      }

      if (interaction.customId === 'updates_log_select') {
        const selectedIndex = Number.parseInt(interaction.values[0], 10);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= UPDATE_LOGS.length) {
          return interaction.reply({
            embeds: [embeds.error('Invalid update log selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const updatesCommand = require('../commands/utility/updates');
        return interaction.update(updatesCommand.buildUpdatesResponse(interaction.guild, selectedIndex));
      }
    }

    if (interaction.isChannelSelectMenu()) {
      if (isComponentExpired(interaction)) {
        return interaction.reply({
          embeds: [embeds.warning('This channel picker has expired. Run the command again to refresh.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      const ownerId = getComponentOwnerId(interaction);
      if (ownerId && ownerId !== interaction.user.id) {
        return interaction.reply({
          embeds: [embeds.error('This channel picker belongs to someone else\'s command.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (interaction.customId.startsWith('bakeadmin_log_channel_select:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const channelId = interaction.values[0];
        economy.setAdminLogChannel(interaction.guild.id, channelId);
        return interaction.update({
          embeds: [embeds.success(`Set bake admin log channel to <#${channelId}>.`, interaction.guild)],
          components: [],
        });
      }
      if (interaction.customId.startsWith('bakeadmin_global_log_channel_select:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const channelId = interaction.values[0];
        economy.setAdminLogChannel(interaction.guild.id, channelId);
        return interaction.update({
          embeds: [embeds.success(`Set bake admin log channel to <#${channelId}>.`, interaction.guild)],
          components: [],
        });
      }
    }

    if (interaction.isUserSelectMenu()) {
      if (isComponentExpired(interaction)) {
        return interaction.reply({
          embeds: [embeds.warning('This user picker has expired. Run the command again to refresh.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      const ownerId = getComponentOwnerId(interaction);
      if (ownerId && ownerId !== interaction.user.id) {
        return interaction.reply({
          embeds: [embeds.error('This user picker belongs to someone else\'s command.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (interaction.customId.startsWith('staffmsg_user_select:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({ embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)], flags: MessageFlags.Ephemeral });
        }
        setPendingStaffMessageSelection(interaction.guild.id, actorId, interaction.values);
        return interaction.reply({
          embeds: [{
            color: 0x5865f2,
            title: '📨 Staff Message — Select Type',
            description: `Recipients: ${interaction.values.map((id) => `<@${id}>`).join(', ')}\n\nChoose the message type:`,
            timestamp: new Date().toISOString(),
          }],
          components: [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`staffmsg_type_select:${actorId}`)
                .setPlaceholder('Select message type...')
                .addOptions(staffMessageCommand.MESSAGE_TYPES),
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (interaction.customId.startsWith('bakeadmin_target_select:')) {
        const actorId = interaction.customId.split(':')[1];
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const targetId = interaction.values[0];
        const embed = economy.buildBakeAdminEmbed(interaction.guild, interaction.user.id, targetId);
        const userActionRows = economy.buildBakeAdminComponents(interaction.user.id, targetId);
        const dashboardActionRows = economy.buildBakeAdminDashboardComponents(interaction.user.id).slice(1);
        const components = [...userActionRows, ...dashboardActionRows];
        return interaction.update({ embeds: [embed], components });
      }
      if (shiftCommand.isShiftPanelSelect(interaction.customId)) {
        return shiftCommand.handleShiftPanelSelect(interaction);
      }
      if (interaction.customId.startsWith('aimanage_user_select:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!aiManageCommand.canManageAiUsage(interaction.member)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have permission to manage AI usage.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await interaction.deferUpdate().catch(() => null);
        const targetId = interaction.values[0];
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        const data = aiManageCommand.readUsage();
        const info = aiManageCommand.resolveUserEffective(data, member, targetId);
        return interaction.editReply({
          embeds: [aiManageCommand.buildUserCardEmbed(interaction.guild, member, targetId)],
          components: aiManageCommand.buildUserCardComponents(actorId, targetId, info),
        });
      }
    }

    if (interaction.isRoleSelectMenu()) {
      const ownerId = getComponentOwnerId(interaction);
      if (ownerId && ownerId !== interaction.user.id) {
        return interaction.reply({
          embeds: [embeds.error('This role picker belongs to someone else\'s command.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (interaction.customId.startsWith('aimanage_role_select:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!aiManageCommand.canManageAiUsage(interaction.member)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have permission to manage AI usage.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await interaction.deferUpdate().catch(() => null);
        const roleId = interaction.values[0];
        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
        if (!role) {
          return interaction.editReply({
            embeds: [embeds.error('Role not found.', interaction.guild)],
            components: aiManageCommand.buildPanelComponents(actorId),
          });
        }
        const data = aiManageCommand.readUsage();
        const info = aiManageCommand.resolveRoleEffective(data, role);
        return interaction.editReply({
          embeds: [aiManageCommand.buildRoleCardEmbed(interaction.guild, role)],
          components: aiManageCommand.buildRoleCardComponents(actorId, roleId, info),
        });
      }
    }

    if (interaction.isModalSubmit()) {
      if (allianceCommand.isAllianceModalCustomId(interaction.customId)) {
        return allianceCommand.handleAllianceModal(interaction);
      }
      if (shiftCommand.isShiftPanelModal(interaction.customId)) {
        return shiftCommand.handleShiftPanelModal(interaction);
      }
      if (automodCommand.isAutomodPanelModal(interaction.customId)) {
        return automodCommand.handleAutomodPanelModal(interaction);
      }
      if (staffInfractionCommand.isStaffInfractionPanelModal(interaction.customId)) {
        return staffInfractionCommand.handleStaffInfractionPanelModal(interaction);
      }

      if (interaction.customId.startsWith('aimanage_value_modal:')) {
        const [, actorId, action, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!aiManageCommand.canManageAiUsage(interaction.member)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have permission to manage AI usage.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const rawValue = interaction.fields.getTextInputValue('value').trim();
        const value = Number.parseInt(rawValue, 10);
        if (!Number.isFinite(value)) {
          return interaction.reply({
            embeds: [embeds.error('Value must be a valid integer.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        let summary = '';
        if (action === 'set-user') {
          aiManageCommand.writeUsage((data) => {
            if (!data.userOverrides) data.userOverrides = {};
            data.userOverrides[targetId] = value < 0 ? { unlimited: true } : { limit: Math.max(0, value), unlimited: false };
          });
          summary = `Set user override for <@${targetId}> to **${value < 0 ? 'unlimited' : `${value}/6h`}**.`;
        } else if (action === 'set-role') {
          aiManageCommand.writeUsage((data) => {
            if (!data.roleOverrides) data.roleOverrides = {};
            data.roleOverrides[targetId] = value < 0 ? { unlimited: true } : { limit: Math.max(0, value), unlimited: false };
          });
          summary = `Set role override for <@&${targetId}> to **${value < 0 ? 'unlimited' : `${value}/6h`}**.`;
        } else if (action === 'grant-user') {
          const bucketStart = aiManageCommand.getBucketStart(Date.now());
          aiManageCommand.writeUsage((data) => {
            const rec = data.usage[targetId] ?? { bucketStart, used: 0 };
            if (Number(rec.bucketStart) !== bucketStart) { rec.bucketStart = bucketStart; rec.used = 0; }
            rec.used = Math.max(0, Number(rec.used ?? 0) - value);
            data.usage[targetId] = rec;
          });
          const direction = value >= 0 ? `+${value}` : String(value);
          summary = `Applied one-time adjustment **${direction}** to <@${targetId}>.`;
        } else if (action === 'grant-role') {
          const members = await interaction.guild.members.fetch();
          const targets = [...members.values()].filter((m) => m.roles.cache.has(targetId));
          const bucketStart = aiManageCommand.getBucketStart(Date.now());
          aiManageCommand.writeUsage((data) => {
            for (const m of targets) {
              const rec = data.usage[m.id] ?? { bucketStart, used: 0 };
              if (Number(rec.bucketStart) !== bucketStart) { rec.bucketStart = bucketStart; rec.used = 0; }
              rec.used = Math.max(0, Number(rec.used ?? 0) - value);
              data.usage[m.id] = rec;
            }
          });
          const direction = value >= 0 ? `+${value}` : String(value);
          summary = `Applied adjustment **${direction}** for **${targets.length}** member(s) in <@&${targetId}>.`;
        } else {
          return interaction.reply({ embeds: [embeds.error('Unknown action.', interaction.guild)], flags: MessageFlags.Ephemeral });
        }

        // If modal came from a component, refresh the card in place.
        const fromMessage = typeof interaction.isFromMessage === 'function' ? interaction.isFromMessage() : Boolean(interaction.message);
        if (fromMessage) {
          await interaction.deferUpdate().catch(() => null);
          const data = aiManageCommand.readUsage();
          if (action === 'set-user' || action === 'grant-user') {
            const member = await interaction.guild.members.fetch(targetId).catch(() => null);
            const info = aiManageCommand.resolveUserEffective(data, member, targetId);
            await interaction.editReply({
              embeds: [aiManageCommand.buildUserCardEmbed(interaction.guild, member, targetId)],
              components: aiManageCommand.buildUserCardComponents(actorId, targetId, info),
            }).catch(() => null);
          } else {
            const role = await interaction.guild.roles.fetch(targetId).catch(() => null);
            if (role) {
              const info = aiManageCommand.resolveRoleEffective(data, role);
              await interaction.editReply({
                embeds: [aiManageCommand.buildRoleCardEmbed(interaction.guild, role)],
                components: aiManageCommand.buildRoleCardComponents(actorId, targetId, info),
              }).catch(() => null);
            }
          }
          return interaction.followUp({
            embeds: [embeds.success(summary, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          }).catch(() => null);
        }

        return interaction.reply({
          embeds: [embeds.success(summary, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('broadcastmsg_compose:')) {
        const rest = interaction.customId.slice('broadcastmsg_compose:'.length);
        const colonIdx = rest.indexOf(':');
        const actorId = rest.slice(0, colonIdx);
        const audience = rest.slice(colonIdx + 1);
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!broadcastMessageCommand.hasLeadManagement(interaction.member)) {
          return interaction.reply({
            embeds: [embeds.error('You need to be Lead Oversight or Management to use this command.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const title = interaction.fields.getTextInputValue('title').trim();
        const message = interaction.fields.getTextInputValue('message').trim();
        if (!message) {
          return interaction.reply({
            embeds: [embeds.error('A message is required.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await tryDeferReplyEphemeral(interaction);
        const guildMembers = await interaction.guild.members.fetch().catch(() => null);
        if (!guildMembers) {
          return interaction.editReply({ embeds: [embeds.error('Failed to fetch guild members.', interaction.guild)] });
        }
        let targetIds = [];
        if (audience === 'everyone') {
          targetIds = [...guildMembers.values()].filter((m) => !m.user.bot).map((m) => m.id);
        } else if (audience.startsWith('role:')) {
          const roleKey = audience.slice(5);
          const roleSetMap = {
            moderation: broadcastMessageCommand.MODERATION_ROLE_IDS,
            sid: broadcastMessageCommand.SID_ROLE_IDS,
            osc: broadcastMessageCommand.OSC_ROLE_IDS,
            facility: broadcastMessageCommand.FACILITY_ROLE_IDS,
            all_staff: broadcastMessageCommand.ALL_STAFF_ROLE_IDS,
            vai_access: new Set(['1493414609678499890']),
          };
          const roleSet = roleSetMap[roleKey];
          if (roleSet) {
            targetIds = [...guildMembers.values()]
              .filter((m) => !m.user.bot && [...roleSet].some((roleId) => m.roles.cache.has(roleId)))
              .map((m) => m.id);
          }
        }
        const audienceLabel = broadcastMessageCommand.AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label ?? audience;
        const broadcastKind = audience === 'role:vai_access' ? 'dev' : 'standard';
        let firstMsgId = null;
        for (const memberId of targetIds) {
          const result = economy.addPendingMessage(interaction.guild.id, memberId, {
            type: 'broadcast',
            broadcastKind,
            from: `${interaction.user.tag}`,
            title,
            content: message,
            broadcastTotal: targetIds.length,
            broadcastSentAt: Date.now(),
          });
          if (firstMsgId === null) firstMsgId = result.id;
        }
        return interaction.editReply({
          embeds: [embeds.success(
            `Broadcast **"${title}"** delivered to **${targetIds.length}** member(s) (${audienceLabel}).\n\n` +
            `Use **/messagestat ${firstMsgId}** to track delivery progress.`,
            interaction.guild
          )],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('staffmsg_message_modal:')) {
        const [, actorId, type] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!staffMessageCommand.hasSeniorModPlus(interaction.member)) {
          return interaction.reply({
            embeds: [embeds.error('You need to be a Senior Moderator or above to use this command.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const message = interaction.fields.getTextInputValue('message').trim();
        if (!message) {
          return interaction.reply({
            embeds: [embeds.error('A message is required.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const recipients = getPendingStaffMessageSelection(interaction.guild.id, actorId);
        if (!recipients.length) {
          return interaction.reply({
            embeds: [embeds.error('No recipients found. Please start over with `/staffmessage`.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        clearPendingStaffMessageSelection(interaction.guild.id, actorId);
        let firstMsgId = null;
        for (const recipientId of recipients) {
          const result = economy.addPendingMessage(interaction.guild.id, recipientId, {
            type: 'staff_message',
            messageType: type,
            from: interaction.user.tag,
            content: message,
            broadcastTotal: recipients.length,
            broadcastSentAt: Date.now(),
          });
          if (firstMsgId === null) firstMsgId = result.id;
        }
        const typeLabel = staffMessageCommand.MESSAGE_TYPES.find((t) => t.value === type)?.label ?? type;
        return interaction.reply({
          embeds: [embeds.success(
            `Message delivered to **${recipients.length}** recipient(s) as **${typeLabel}**.\n\n` +
            `Use **/messagestat ${firstMsgId}** to track delivery progress.`,
            interaction.guild
          )],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('ctx_report_message:')) {
        const [, sourceChannelId, messageId, authorId] = interaction.customId.split(':');
        const remainingMs = getReportCooldownRemainingMs(interaction.guild.id, interaction.user.id, Date.now());
        if (remainingMs > 0) {
          return interaction.reply({
            embeds: [embeds.warning(`You can submit another report in **${Math.ceil(remainingMs / 60_000)} minute(s)**.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await tryDeferReplyEphemeral(interaction);
        const category = interaction.fields.getTextInputValue('category').trim();
        const reason = interaction.fields.getTextInputValue('reason').trim();
        const reportChannel = await interaction.guild.channels.fetch(REPORTS_CHANNEL_ID).catch(() => null);
        if (!reportChannel || !reportChannel.isTextBased()) {
          return interaction.editReply({
            embeds: [embeds.error('Reports channel is not configured correctly.', interaction.guild)],
          });
        }

        const sourceChannel = await interaction.guild.channels.fetch(sourceChannelId).catch(() => null);
        if (!sourceChannel || !sourceChannel.isTextBased()) {
          return interaction.editReply({
            embeds: [embeds.error('Original channel is no longer available.', interaction.guild)],
          });
        }
        const sourceMessage = await sourceChannel.messages.fetch(messageId).catch(() => null);
        const messageContent = sourceMessage?.content?.slice(0, 1000) || '(message unavailable)';
        const messageBlock = `\`\`\`\n${messageContent.slice(0, 950)}\n\`\`\``;
        const attachmentSummary = sourceMessage?.attachments?.size
          ? sourceMessage.attachments
            .map((attachment) => `• ${(attachment.name ?? 'attachment').slice(0, 120)}`)
            .slice(0, 3)
            .join('\n')
          : 'None';
        const jumpLink = sourceMessage?.url ?? 'Unavailable';

        const reportEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('Message Report Queue Entry')
          .setDescription('Review this report and pick an action below. Use server rules for context before actioning.')
          .addFields(
            { name: 'Category', value: category.slice(0, 100), inline: true },
            { name: 'Reporter', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Author', value: `<@${authorId}>`, inline: true },
            { name: 'Channel', value: `${sourceChannel}`, inline: true },
            { name: 'Rules', value: `[View Server Rules](${RULES_CHANNEL_URL})`, inline: true },
            { name: 'Reported Content', value: `\`\`\`\n${messageContent.slice(0, 950)}\n\`\`\``, inline: false },
            { name: 'Attachments', value: attachmentSummary.slice(0, 1024), inline: false },
            { name: 'Reason', value: reason.slice(0, 1024), inline: false },
            { name: 'Jump Link', value: jumpLink, inline: false },
          )
          .setTimestamp();

        const actions = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(buildReportActionCustomId('delete_message', messageId, interaction.user.id)).setLabel('Delete Message').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(buildReportActionCustomId('warn_author', messageId, interaction.user.id)).setLabel('Warn Author').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(buildReportActionCustomId('timeout_author', messageId, interaction.user.id)).setLabel('Timeout Author').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(buildReportActionCustomId('dismiss', messageId, interaction.user.id)).setLabel('Dismiss').setStyle(ButtonStyle.Success),
        );

        await reportChannel.send({
          embeds: [reportEmbed],
          components: [actions],
        }).catch(() => null);
        touchReportCooldown(interaction.guild.id, interaction.user.id, Date.now());
        queueReportInboxUpdate(interaction.guild.id, interaction.user.id, 'submitted');

        return interaction.editReply({
          embeds: [embeds.success('Report submitted to moderators.', interaction.guild)],
        });
      }

      if (interaction.customId.startsWith('report_dismiss_reason:')) {
        if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
          return interaction.reply({
            embeds: [embeds.error('Only moderation staff can use report actions.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const [, reportMessageId, reporterId] = interaction.customId.split(':');
        const dismissReason = interaction.fields.getTextInputValue('reason').trim();
        if (!dismissReason) {
          return interaction.reply({
            embeds: [embeds.error('A dismissal reason is required.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await tryDeferReplyEphemeral(interaction);
        const reportChannel = await interaction.guild.channels.fetch(REPORTS_CHANNEL_ID).catch(() => null);
        const reportMessage = reportChannel?.isTextBased()
          ? await reportChannel.messages.fetch(reportMessageId).catch(() => null)
          : null;
        const existingEmbed = reportMessage?.embeds?.[0]
          ? EmbedBuilder.from(reportMessage.embeds[0])
          : embeds.info('Message Report', 'Report dismissed.', interaction.guild);
        existingEmbed.addFields({
          name: 'Dismissed By',
          value: `${interaction.user} (\`${interaction.user.tag}\`)`,
          inline: true,
        }, {
          name: 'Dismissal Reason',
          value: dismissReason.slice(0, 1024),
          inline: false,
        });

        if (reportMessage) {
          await reportMessage.edit({ embeds: [existingEmbed], components: [] }).catch(() => null);
        }
        await interaction.editReply({
          embeds: [embeds.success('Report dismissed with a recorded reason.', interaction.guild)],
        });
        if (reporterId) {
          queueReportInboxUpdate(interaction.guild.id, reporterId, 'dismissed');
        }
        return;
      }

      if (interaction.customId.startsWith(REPORT_WARN_MODAL_PREFIX)) {
        if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
          return interaction.reply({
            embeds: [embeds.error('Only moderation staff can use report actions.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const suffix = interaction.customId.slice(REPORT_WARN_MODAL_PREFIX.length);
        const [reportMessageId, sourceChannelId, messageId, authorId, reporterId = ''] = suffix.split(':');
        const reason = interaction.fields.getTextInputValue('reason').trim();
        if (!reason) {
          return interaction.reply({
            embeds: [embeds.error('A reason is required.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await tryDeferReplyEphemeral(interaction);
        const targetMember = await interaction.guild.members.fetch(authorId).catch(() => null);
        const targetUser = targetMember?.user ?? await interaction.client.users.fetch(authorId).catch(() => null);
        const targetChannel = await interaction.guild.channels.fetch(sourceChannelId).catch(() => null);
        const targetMessage = targetChannel?.isTextBased()
          ? await targetChannel.messages.fetch(messageId).catch(() => null)
          : null;
        const reportedContent = (targetMessage?.content ?? '(message unavailable)').slice(0, 300);
        const fullReason = `${reason}\nReported content: ${reportedContent}`;
        const warnings = db.addWarning(interaction.guild.id, authorId, {
          moderatorId: interaction.user.id,
          reason: fullReason,
        });
        if (targetUser) {
          await sendModerationActionDm({
            user: targetUser,
            guild: interaction.guild,
            action: 'Warning',
            reason: fullReason,
            moderatorTag: interaction.user.tag,
          });
        }
        await sendModLog({
          guild: interaction.guild,
          target: targetUser,
          moderator: interaction.user,
          action: 'Warn',
          reason: fullReason,
          extra: `Total warnings: **${warnings.length}** • From report queue`,
        });
        analytics.recordModAction(interaction.guild.id, 'warn', Date.now());
        if (reportMessageId) {
          const reportChannel = await interaction.guild.channels.fetch(REPORTS_CHANNEL_ID).catch(() => null);
          const reportMessage = reportChannel?.isTextBased()
            ? await reportChannel.messages.fetch(reportMessageId).catch(() => null)
            : null;
          if (reportMessage) {
            const existingEmbed = reportMessage.embeds?.[0]
              ? EmbedBuilder.from(reportMessage.embeds[0])
              : null;
            if (existingEmbed) {
              existingEmbed.addFields({
                name: 'Action Taken',
                value: `Warned by ${interaction.user} — ${reason}`,
                inline: false,
              });
              await reportMessage.edit({ embeds: [existingEmbed], components: [] }).catch(() => null);
            }
          }
        }
        if (reporterId) {
          queueReportInboxUpdate(interaction.guild.id, reporterId, 'action_taken');
        }
        return interaction.editReply({ embeds: [embeds.success('Author warned and action logged.', interaction.guild)] });
      }

      if (interaction.customId.startsWith(REPORT_TIMEOUT_MODAL_PREFIX)) {
        if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
          return interaction.reply({
            embeds: [embeds.error('Only moderation staff can use report actions.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const suffix = interaction.customId.slice(REPORT_TIMEOUT_MODAL_PREFIX.length);
        const [reportMessageId, sourceChannelId, messageId, authorId, reporterId = ''] = suffix.split(':');
        const reason = interaction.fields.getTextInputValue('reason').trim();
        if (!reason) {
          return interaction.reply({
            embeds: [embeds.error('A reason is required.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const durationRaw = interaction.fields.getTextInputValue('duration').trim().toLowerCase();
        let durationMs = 60 * 60_000; // default 1 hour
        let durationLabel = '1 hour';
        if (durationRaw) {
          const match = durationRaw.match(/^(\d+)\s*(m(?:in(?:utes?)?)?|h(?:ours?)?|d(?:ays?)?)$/i);
          if (match) {
            const amount = Number.parseInt(match[1], 10);
            const unit = match[2][0].toLowerCase();
            if (unit === 'm') { durationMs = amount * 60_000; durationLabel = `${amount} minute(s)`; }
            else if (unit === 'h') { durationMs = amount * 60 * 60_000; durationLabel = `${amount} hour(s)`; }
            else if (unit === 'd') { durationMs = amount * 24 * 60 * 60_000; durationLabel = `${amount} day(s)`; }
          }
        }
        // Discord timeout max is 28 days
        durationMs = Math.min(durationMs, 28 * 24 * 60 * 60_000);
        await tryDeferReplyEphemeral(interaction);
        const targetMember = await interaction.guild.members.fetch(authorId).catch(() => null);
        const targetUser = targetMember?.user ?? await interaction.client.users.fetch(authorId).catch(() => null);
        const targetChannel = await interaction.guild.channels.fetch(sourceChannelId).catch(() => null);
        const targetMessage = targetChannel?.isTextBased()
          ? await targetChannel.messages.fetch(messageId).catch(() => null)
          : null;
        const reportedContent = (targetMessage?.content ?? '(message unavailable)').slice(0, 300);
        const fullReason = `${reason}\nReported content: ${reportedContent}`;
        if (targetMember) {
          await sendModerationActionDm({
            user: targetMember.user,
            guild: interaction.guild,
            action: 'Timeout',
            reason: fullReason,
            moderatorTag: interaction.user.tag,
            duration: durationLabel,
          });
          await targetMember.timeout(durationMs, `${interaction.user.tag}: ${reason}`).catch(() => null);
        }
        await sendModLog({
          guild: interaction.guild,
          target: targetUser,
          moderator: interaction.user,
          action: 'Timeout',
          reason: fullReason,
          extra: `Duration: **${durationLabel}** • From report queue`,
        });
        analytics.recordModAction(interaction.guild.id, 'timeout', Date.now());
        if (reportMessageId) {
          const reportChannel = await interaction.guild.channels.fetch(REPORTS_CHANNEL_ID).catch(() => null);
          const reportMessage = reportChannel?.isTextBased()
            ? await reportChannel.messages.fetch(reportMessageId).catch(() => null)
            : null;
          if (reportMessage) {
            const existingEmbed = reportMessage.embeds?.[0]
              ? EmbedBuilder.from(reportMessage.embeds[0])
              : null;
            if (existingEmbed) {
              existingEmbed.addFields({
                name: 'Action Taken',
                value: `Timed out ${durationLabel} by ${interaction.user} — ${reason}`,
                inline: false,
              });
              await reportMessage.edit({ embeds: [existingEmbed], components: [] }).catch(() => null);
            }
          }
        }
        if (reporterId) {
          queueReportInboxUpdate(interaction.guild.id, reporterId, 'action_taken');
        }
        return interaction.editReply({ embeds: [embeds.success(`Author timed out for ${durationLabel} and action logged.`, interaction.guild)] });
      }

      if (interaction.customId.startsWith(AUTOMOD_REVIEW_TIMEOUT_MODAL_PREFIX)) {
        if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
          return interaction.reply({
            embeds: [embeds.error('Only moderation staff can use AutoMod review actions.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const suffix = interaction.customId.slice(AUTOMOD_REVIEW_TIMEOUT_MODAL_PREFIX.length);
        const [authorId, sourceChannelId, messageId] = suffix.split(':');
        const reason = interaction.fields.getTextInputValue('reason').trim();
        const durationRaw = interaction.fields.getTextInputValue('duration').trim();
        if (!reason || !durationRaw) {
          return interaction.reply({
            embeds: [embeds.error('Reason and duration are required.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const durationMs = parseDuration(durationRaw);
        if (!durationMs || durationMs <= 0) {
          return interaction.reply({
            embeds: [embeds.error('Invalid duration. Use values like `15m`, `1h`, or `1d`.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        await tryDeferReplyEphemeral(interaction);
        const targetMember = await interaction.guild.members.fetch(authorId).catch(() => null);
        if (!targetMember || !targetMember.moderatable) {
          return interaction.editReply({
            embeds: [embeds.error('Cannot timeout this user (missing member, permissions, or role hierarchy).', interaction.guild)],
          });
        }

        await targetMember.timeout(durationMs, `${interaction.user.tag}: ${reason}`).catch(() => null);
        await sendModerationActionDm({
          user: targetMember.user,
          guild: interaction.guild,
          action: 'Timeout',
          reason,
          moderatorTag: interaction.user.tag,
          duration: formatDuration(durationMs),
        });
        await sendModLog({
          guild: interaction.guild,
          target: targetMember.user,
          moderator: interaction.user,
          action: 'Timeout',
          reason,
          extra: `Source: AutoMod review • Duration: **${formatDuration(durationMs)}** • Channel: <#${sourceChannelId}> • Message ID: \`${messageId}\``,
        });

        await interaction.message.edit({ components: [] }).catch(() => null);
        return interaction.editReply({ embeds: [embeds.success(`Timed out <@${authorId}> for **${formatDuration(durationMs)}**.`, interaction.guild)] });
      }

      if (interaction.customId === 'bakery_modal_name') {
        const name = interaction.fields.getTextInputValue('name').trim();
        const sanitized = economy.sanitizeBakeryName(name);
        if (!sanitized.ok) {
          return interaction.reply({
            embeds: [embeds.error(sanitized.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const itemOptions = buildInventoryItemSelectOptions(snapshot.user, interaction.guild);
        if (itemOptions.length === 0) {
          const setResult = economy.setBakeryIdentity(interaction.guild.id, interaction.user.id, sanitized.value);
          if (!setResult?.ok) {
            return interaction.reply({
              embeds: [embeds.error(setResult?.reason ?? 'Could not update bakery identity.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          return interaction.reply({
            embeds: [embeds.success(`Your bakery is now **${setResult.bakeryEmoji} ${setResult.bakeryName}**.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        setPendingBakeryRenameSelection(interaction.guild.id, interaction.user.id, sanitized.value);
        return interaction.reply({
          embeds: [embeds.info('Choose Bakery Emoji', 'Select a cookie from your inventory to use as your bakery emoji.', interaction.guild)],
          components: [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('bakery_name_emoji_select')
                .setPlaceholder('Select bakery emoji from inventory')
                .addOptions(itemOptions),
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'bakery_set_listing' || interaction.customId === 'market_list_item') {
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const itemOptions = buildInventoryItemSelectOptions(snapshot.user, interaction.guild);
        if (itemOptions.length === 0) {
          return interaction.reply({
            embeds: [embeds.warning('You have no inventory items to list.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          embeds: [embeds.info('List Item', 'Select an inventory item to list.', interaction.guild)],
          components: [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('market_list_item_select')
                .setPlaceholder('Select an item')
                .addOptions(itemOptions),
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('market_modal_list:')) {
        const itemId = interaction.customId.split(':')[1];
        const quantity = Number.parseInt(interaction.fields.getTextInputValue('quantity').trim(), 10);
        const price = Number.parseInt(interaction.fields.getTextInputValue('price').trim(), 10);
        if (!economy.ITEM_MAP.has(itemId)) {
          return interaction.reply({
            embeds: [embeds.error('Invalid item ID.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isInteger(price) || price <= 0) {
          return interaction.reply({
            embeds: [embeds.error('Quantity and price must be positive integers.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const result = economy.listItemForSale(interaction.guild.id, interaction.user.id, interaction.user.tag, itemId, quantity, price);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.reply({
          embeds: [embeds.success(`Listed **${quantity}x ${economy.ITEM_MAP.get(itemId).name}** for **${economy.toCookieNumber(price)}** each.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakeadmin_reward_box_modal:')) {
        const [, actorId, targetId, rewardBoxId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin modal is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const quantity = Number.parseInt(interaction.fields.getTextInputValue('quantity').trim(), 10);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return interaction.reply({
            embeds: [embeds.error('Quantity must be a positive integer.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const giftMessage = interaction.fields.getTextInputValue('message')?.trim() ?? '';
        const rewardBox = economy.REWARD_BOXES.find((entry) => entry.id === rewardBoxId);
        const ok = economy.adminGrantRewardBoxWithMessage(interaction.guild.id, targetId, rewardBoxId, quantity, giftMessage, interaction.user.tag);
        if (!ok) {
          return interaction.reply({
            embeds: [embeds.error('Could not grant that reward gift box.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await tryDeferReplyEphemeral(interaction);
        await sendBakeAdminLog(interaction, targetId, 'Grant Reward Gift Box', `${rewardBoxId} x${quantity}`);
        return interaction.editReply({
          embeds: [embeds.success(`Granted ${economy.getRewardBoxEmoji(rewardBox, interaction.guild)} **${quantity}x ${rewardBox?.name ?? rewardBoxId}** to <@${targetId}>.`, interaction.guild)],
        });
      }

      if (interaction.customId.startsWith('bakeadmin_item_quantity_modal:')) {
        const [, actorId, targetId, itemId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin modal is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const quantity = Number.parseInt(interaction.fields.getTextInputValue('quantity').trim(), 10);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          return interaction.reply({
            embeds: [embeds.error('Quantity must be a positive integer.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const ok = economy.adminGiveItem(interaction.guild.id, targetId, itemId, quantity);
        if (!ok) {
          return interaction.reply({
            embeds: [embeds.error('Could not grant that item.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await tryDeferReplyEphemeral(interaction);
        await sendBakeAdminLog(interaction, targetId, 'Give Item', `${itemId} x${quantity}`);
        return interaction.editReply({
          embeds: [embeds.success(`Gave **${quantity}x ${economy.ITEM_MAP.get(itemId)?.name ?? itemId}** to <@${targetId}>.`, interaction.guild)],
        });
      }

      if (interaction.customId.startsWith('bakeadmin_building_count_modal:')) {
        const [, actorId, targetId, buildingId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin modal is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const count = Number.parseInt(interaction.fields.getTextInputValue('count').trim(), 10);
        if (!Number.isInteger(count) || count < 0) {
          return interaction.reply({
            embeds: [embeds.error('Count must be a non-negative integer.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const ok = economy.adminSetBuilding(interaction.guild.id, targetId, buildingId, count);
        if (!ok) {
          return interaction.reply({
            embeds: [embeds.error('Could not set that building count.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await tryDeferReplyEphemeral(interaction);
        await sendBakeAdminLog(interaction, targetId, 'Set Building Count', `${buildingId}=${count}`);
        return interaction.editReply({
          embeds: [embeds.success(`Set **${buildingId}** to **${count}** for <@${targetId}>.`, interaction.guild)],
        });
      }

      if (interaction.customId.startsWith('bakeadmin_alliance_delete_modal:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const allianceId = interaction.values[0];
        const alliance = alliances.listAlliances(interaction.guild.id).find((entry) => entry.id === allianceId);
        if (!alliance) {
          return interaction.reply({
            embeds: [embeds.error('Unknown alliance selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`bakeadmin_alliance_delete_modal:${actorId}:${targetId}:${alliance.id}`)
          .setTitle(`Delete ${alliance.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('confirm')
                .setLabel('Type DELETE to confirm')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('bakeadmin_alliance_points_modal:')) {
        const [, actorId, mode, allianceId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin modal is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const amountRaw = interaction.fields.getTextInputValue('amount').trim();
        const amount = Number.parseInt(amountRaw, 10);
        if (!Number.isInteger(amount) || amount <= 0) {
          return interaction.reply({
            embeds: [embeds.error('Amount must be a positive whole number.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const delta = mode === 'take' ? -amount : amount;
        const result = alliances.adminAdjustAlliancePoints(interaction.guild.id, allianceId, delta);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.error(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await tryDeferReplyEphemeral(interaction);
        await sendBakeAdminLog(
          interaction,
          actorId,
          mode === 'take' ? 'Alliance: Take Points' : 'Alliance: Add Points',
          `${result.allianceName} (${result.allianceId}) delta=${result.delta} total=${result.points}`,
        );
        return interaction.editReply({
          embeds: [embeds.success(
            `${mode === 'take' ? 'Removed' : 'Added'} **${Math.abs(result.delta)}** alliance points ${mode === 'take' ? 'from' : 'to'} **${result.allianceName}**.\nNew total: **${result.points}**`,
            interaction.guild,
          )],
        });
      }

      if (interaction.customId.startsWith('bakeadmin_alliance_delete_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const allianceId = interaction.values[0];
        const alliance = alliances.listAlliances(interaction.guild.id).find((entry) => entry.id === allianceId);
        if (!alliance) {
          return interaction.reply({
            embeds: [embeds.error('Unknown alliance selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`bakeadmin_alliance_delete_modal:${actorId}:${targetId}:${alliance.id}`)
          .setTitle(`Delete ${alliance.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('confirm')
                .setLabel('Type DELETE to confirm')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('bakeadmin_achievement_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const achievementId = interaction.values[0];
        const ok = economy.adminGrantAchievement(interaction.guild.id, targetId, achievementId);
        if (!ok) {
          return interaction.reply({
            embeds: [embeds.error('Could not grant that achievement.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await tryDeferReplyEphemeral(interaction);
        await sendBakeAdminLog(interaction, targetId, 'Grant Achievement', `Achievement: ${achievementId}`);
        return interaction.editReply({
          embeds: [embeds.success(`Granted achievement \`${achievementId}\` to <@${targetId}>.`, interaction.guild)],
        });
      }

      if (interaction.customId.startsWith('bakeadmin_rank_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const rankId = interaction.values[0];
        const ok = economy.adminSetRank(interaction.guild.id, targetId, rankId);
        if (!ok) {
          return interaction.reply({
            embeds: [embeds.error('Could not set that rank.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const rank = economy.RANKS.find((entry) => entry.id === rankId);
        await tryDeferReplyEphemeral(interaction);
        await sendBakeAdminLog(interaction, targetId, 'Set Rank', `Rank: ${rankId}`);
        return interaction.editReply({
          embeds: [embeds.success(`Set rank for <@${targetId}> to ${economy.getRankEmoji(rank, interaction.guild)} **${rank?.name ?? rankId}**.`, interaction.guild)],
        });
      }

      if (interaction.customId.startsWith('bakeadmin_reward_box_select:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const rewardBoxId = interaction.values[0];
        const rewardBox = economy.REWARD_BOXES.find((entry) => entry.id === rewardBoxId);
        if (!rewardBox) {
          return interaction.reply({
            embeds: [embeds.error('Unknown reward gift box.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const modal = new ModalBuilder()
          .setCustomId(`bakeadmin_reward_box_modal:${actorId}:${targetId}:${rewardBoxId}`)
          .setTitle(`Grant ${rewardBox.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('quantity')
                .setLabel('Quantity')
                .setStyle(TextInputStyle.Short)
                .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('message')
                .setLabel('Gift message (required)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500),
            ),
          );
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'updates_log_select') {
        const selectedIndex = Number.parseInt(interaction.values[0], 10);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= UPDATE_LOGS.length) {
          return interaction.reply({
            embeds: [embeds.error('Invalid update log selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const updatesCommand = require('../commands/utility/updates');
        return interaction.update(updatesCommand.buildUpdatesResponse(interaction.guild, selectedIndex));
      }
    }

    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);

      if (
        REASON_AUTOCOMPLETE_COMMANDS.has(interaction.commandName) &&
        focused.name === 'reason' &&
        interaction.guildId
      ) {
        const presets = db.getPresetReasons(interaction.guildId, interaction.commandName);
        const query = focused.value.toLowerCase();
        const matches = presets
          .filter((r) => r.reason.toLowerCase().includes(query))
          .slice(0, 25)
          .map((r) => ({ name: r.reason.slice(0, 100), value: r.reason }));
        await interaction.respond(matches).catch(() => null);
        return;
      }

      if (interaction.commandName === 'daily' && focused.name === 'claim' && interaction.guildId) {
        const status = challenges.getChallengeStatus(interaction.guildId, interaction.user.id, Date.now());
        const options = [];
        if (!status.daily.claimed && status.daily.complete) {
          options.push({ name: `Claim Daily: ${status.daily.name} (+${economy.toCookieNumber(status.daily.rewardCookies)} cookies)`, value: 'all' });
        }
        if (!status.weekly.claimed && status.weekly.complete) {
          options.push({ name: `Claim Weekly: ${status.weekly.name} (+${economy.toCookieNumber(status.weekly.rewardCookies)} cookies)`, value: 'all' });
        }
        if (options.length === 0) {
          options.push({ name: 'No claimable rewards at this time', value: 'none' });
        }
        await interaction.respond(options).catch(() => null);
        return;
      }

      if (interaction.commandName === 'help' && focused.name === 'command') {
        return helpCommand.handleHelpAutocomplete(interaction);
      }

      return;
    }

    if (
      !interaction.isChatInputCommand()
      && !interaction.isUserContextMenuCommand()
      && !interaction.isMessageContextMenuCommand()
    ) return;

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      if (interaction.commandName === 'cookieleaderboard') {
        console.warn('Received stale /cookieleaderboard interaction; command was removed and should be redeployed away.');
      } else {
        console.warn(`No command matching ${interaction.commandName} was found.`);
      }
      const missingCommandEmbed = embeds
        .error(
          'This command is no longer available. If it still appears, redeploy slash commands to clean stale registrations.',
          interaction.guild ?? null,
        )
        .addFields({
          name: '  Command',
          value: `\`/${interaction.commandName}\``,
          inline: true,
        });
      await interaction.reply({ embeds: [missingCommandEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
      return;
    }

    const restrictedReason = commandRestrictions.getRestrictionReason(interaction.user.id, interaction.commandName);
    if (restrictedReason) {
      await interaction.reply({
        embeds: [embeds.warning(`You are globally restricted from using \`/${interaction.commandName}\`.\nReason: ${restrictedReason}`, interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      }).catch(() => null);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error executing ${interaction.commandName}:`, err);

      const errorEmbed = embeds
        .error(
          'An unexpected error occurred while running this command. Please try again later.',
          interaction.guild ?? null,
        )
        .addFields(
          {
            name: '  Command',
            value: `\`/${interaction.commandName}\``,
            inline: true,
          },
          {
            name: '  Error Details',
            value: `\`${getErrorDetails(err)}\``,
          },
        );

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
      } else {
        await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }
    } catch (err) {
      if (isUnknownInteractionError(err)) return;
      console.error('InteractionCreate handler error:', err);
    }
  },
};
