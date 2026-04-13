'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  EmbedBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../utils/database');
const { formatDuration } = require('../utils/helpers');
const { fetchRobloxProfileByUsername, createRobloxEmbed } = require('../utils/roblox');
const { ROLE_IDS } = require('../utils/roles');
const { hasModLevel, MOD_LEVEL } = require('../utils/permissions');
const { UPDATE_LOGS, createUpdateEmbed } = require('../utils/updateLogs');
const economy = require('../utils/bakeEconomy');
const alliances = require('../utils/bakeAlliances');
const bakeCommand = require('../commands/utility/bake');
const allianceCommand = require('../commands/utility/alliance');
const helpCommand = require('../commands/utility/help');
const shiftCommand = require('../commands/shifts/shift');
const automodCommand = require('../commands/setup/automod');
const staffInfractionCommand = require('../commands/moderation/staffinfraction');
const staffMessageCommand = require('../commands/moderation/staffmessage');
const broadcastMessageCommand = require('../commands/moderation/broadcastmessage');
const challenges = require('../utils/bakeryChallenges');
const { sendModerationActionDm, sendReporterStatusDm } = require('../utils/moderationNotifications');
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
const MAX_PENDING_RENAME_SELECTIONS = 2_000;
const MAX_GUIDE_VIEW_SELECTIONS = 5_000;
const STAFF_MESSAGE_SELECTION_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_STAFF_MESSAGE_SELECTIONS = 2_000;
const pendingBakeryRenameSelections = new Map();
const guideViewSelections = new Map();
const reportCooldowns = new Map();
const pendingStaffMessageSelections = new Map();

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
if (typeof renameSelectionPruneTimer.unref === 'function') renameSelectionPruneTimer.unref();
if (typeof guideStatePruneTimer.unref === 'function') guideStatePruneTimer.unref();

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
    special_cookie_hunt: '🍪',
    golden_fever: '✨',
    sugar_rush: '⚡',
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
      { name: '⏰ Starts', value: `<t:${startedAtTs}:F> (<t:${startedAtTs}:R>)`, inline: true },
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
      .setLabel('🍪 Open Bake Commands')
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
  if (
    customId?.startsWith('bakery_')
    || customId?.startsWith('market_')
    || customId?.startsWith('messages_')
    || customId === 'updates_log_select'
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

function buildPagedStringSelectRows({ customIdPrefix, placeholderBase, options }) {
  const optionChunks = chunkSelectOptions(options, MAX_SELECT_MENU_OPTIONS).slice(0, 5);
  return optionChunks.map((chunk, chunkIndex) =>
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${customIdPrefix}:${chunkIndex}`)
        .setPlaceholder(optionChunks.length > 1 ? `${placeholderBase} (${chunkIndex + 1}/${optionChunks.length})` : placeholderBase)
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(chunk),
    ));
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

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
    if (interaction.isButton()) {
      if (isComponentExpired(interaction)) {
        return interaction.reply({
          embeds: [embeds.warning('These buttons have expired. Run the command again to refresh.', interaction.guild)],
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

      if (interaction.customId.startsWith('ctx_mod_')) {
        if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
          return interaction.reply({
            embeds: [embeds.error('You no longer have permission to use this moderation panel.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const [, actionWithTarget] = interaction.customId.split('ctx_mod_');
        const [action, targetId] = actionWithTarget.split(':');
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!member) {
          return interaction.reply({
            embeds: [embeds.error('That user is no longer in this server.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
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
          return interaction.reply({
            embeds: [embeds.success(`Warned <@${targetId}>.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
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
            return interaction.reply({
              embeds: [embeds.error('Failed to timeout user (permissions or hierarchy).', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          return interaction.reply({
            embeds: [embeds.success(`Timed out <@${targetId}> for **${Math.floor(durationMs / 60_000)}m**.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
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
            return interaction.reply({
              embeds: [embeds.error('Failed to kick user (permissions or hierarchy).', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          return interaction.reply({
            embeds: [embeds.success(`Kicked <@${targetId}>.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
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
            return interaction.reply({
              embeds: [embeds.error('Failed to ban user (permissions or hierarchy).', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          return interaction.reply({
            embeds: [embeds.success(`Banned <@${targetId}>.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
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
        const targetChannel = await interaction.guild.channels.fetch(sourceChannelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) {
          return interaction.reply({
            embeds: [embeds.error('Source channel is unavailable for this report.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const targetMessage = await targetChannel.messages.fetch(messageId).catch(() => null);
        const targetMember = await interaction.guild.members.fetch(authorId).catch(() => null);
        if (action === 'delete_message' && targetMessage) {
          await targetMessage.delete().catch(() => null);
          if (reporterId) {
            const reporter = await interaction.client.users.fetch(reporterId).catch(() => null);
            await sendReporterStatusDm({ user: reporter, guild: interaction.guild, status: 'action_taken' });
          }
          return interaction.reply({ embeds: [embeds.success('Reported message deleted.', interaction.guild)], flags: MessageFlags.Ephemeral });
        }
        if (action === 'warn_author') {
          const reportedContent = (targetMessage?.content ?? '(message unavailable)').slice(0, 700);
          const reason = `Warning issued from report queue.\nReported content: ${reportedContent}`;
          db.addWarning(interaction.guild.id, authorId, {
            moderatorId: interaction.user.id,
            reason,
          });
          if (targetMember?.user) {
            await sendModerationActionDm({
              user: targetMember.user,
              guild: interaction.guild,
              action: 'Warning',
              reason,
              moderatorTag: interaction.user.tag,
            });
          }
          if (reporterId) {
            const reporter = await interaction.client.users.fetch(reporterId).catch(() => null);
            await sendReporterStatusDm({ user: reporter, guild: interaction.guild, status: 'action_taken' });
          }
          return interaction.reply({ embeds: [embeds.success('Author warned.', interaction.guild)], flags: MessageFlags.Ephemeral });
        }
        if (action === 'timeout_author' && targetMember) {
          const reason = 'Timeout issued from report queue.';
          await sendModerationActionDm({
            user: targetMember.user,
            guild: interaction.guild,
            action: 'Timeout',
            reason,
            moderatorTag: interaction.user.tag,
            duration: '1 hour',
          });
          await targetMember.timeout(60 * 60_000, `${interaction.user.tag}: report action`).catch(() => null);
          if (reporterId) {
            const reporter = await interaction.client.users.fetch(reporterId).catch(() => null);
            await sendReporterStatusDm({ user: reporter, guild: interaction.guild, status: 'action_taken' });
          }
          return interaction.reply({ embeds: [embeds.success('Author timed out for 1 hour.', interaction.guild)], flags: MessageFlags.Ephemeral });
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
        const messageId = Number.parseInt(parts[2], 10);
        const result = economy.claimPendingMessage(interaction.guild.id, interaction.user.id, messageId);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        let replyText = '✅ Reward claimed!';
        if (result.type === 'gift_box') {
          const box = economy.REWARD_BOXES.find((b) => b.id === result.reward.rewardBoxId);
          replyText = `✅ Claimed **${result.reward.quantity}x ${box?.name ?? result.reward.rewardBoxId}** — open it from your bakery inventory!`;
        } else if (result.type === 'gift_cookies') {
          replyText = `✅ Claimed **${economy.toCookieNumber(result.reward.cookieAmount)}** cookies!`;
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildMessagesEmbed(interaction.guild, snapshot.user, currentPage);
        const components = economy.buildMessagesComponents(snapshot.user, currentPage);
        embed.addFields({ name: 'Claimed', value: replyText });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId === 'messages_claim_all') {
        const claimed = economy.claimAllPendingMessages(interaction.guild.id, interaction.user.id);
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildMessagesEmbed(interaction.guild, snapshot.user, 0);
        const components = economy.buildMessagesComponents(snapshot.user, 0);
        if (claimed.length === 0) {
          embed.addFields({ name: 'Claim All', value: 'No unclaimed rewards found.' });
        } else {
          const boxTotals = new Map();
          let cookieTotal = 0;
          for (const r of claimed) {
            if (r.type === 'gift_box') {
              boxTotals.set(r.rewardBoxId, (boxTotals.get(r.rewardBoxId) ?? 0) + r.quantity);
            } else if (r.type === 'gift_cookies') {
              cookieTotal += r.cookieAmount;
            }
          }
          const lines = [];
          for (const [boxId, qty] of boxTotals) {
            const box = economy.REWARD_BOXES.find((b) => b.id === boxId);
            lines.push(`🎁 **${qty}x ${box?.name ?? boxId}**`);
          }
          if (cookieTotal > 0) lines.push(`🍪 **${economy.toCookieNumber(cookieTotal)} cookies**`);
          embed.addFields({ name: `✅ Claimed ${claimed.length} reward(s)`, value: lines.join('\n') || 'Done!' });
        }
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('messages_delete:')) {
        const parts = interaction.customId.split(':');
        const currentPage = Number.parseInt(parts[1], 10) || 0;
        const messageId = Number.parseInt(parts[2], 10);
        economy.deletePendingMessage(interaction.guild.id, interaction.user.id, messageId);
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const totalPages = Math.max(1, Math.ceil(snapshot.user.pendingMessages.length / 8));
        const safePage = Math.max(0, Math.min(currentPage, totalPages - 1));
        const embed = economy.buildMessagesEmbed(interaction.guild, snapshot.user, safePage);
        const components = economy.buildMessagesComponents(snapshot.user, safePage);
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
        // Quick sell all items currently in the user's inventory that came from opening a gift box.
        // We sell all sellable items in the user's full inventory at once.
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const user = snapshot.user;
        let totalEarned = 0;
        let itemsSold = 0;
        for (const itemId of Object.keys(user.inventory ?? {})) {
          const qty = user.inventory[itemId] ?? 0;
          if (qty <= 0) continue;
          const result = economy.sellInventoryItem(interaction.guild.id, interaction.user.id, itemId, true);
          if (result.ok) {
            totalEarned += result.value ?? 0;
            itemsSold += qty;
          }
        }
        return interaction.reply({
          embeds: [
            embeds.success(`Sold **${economy.toCookieNumber(itemsSold)}** item(s) from your inventory for **${economy.toCookieNumber(totalEarned)}** cookies.`, interaction.guild),
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
          name: `${economy.getButtonEmoji(interaction.guild, ['Paid_in_full', 'sell'], '💸')} Upgrade Sold`,
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

      if (interaction.customId.startsWith('userinfo_roblox:')) {
        const [, targetId, encodedQuery] = interaction.customId.split(':');
        if (!targetId) {
          return interaction.reply({
            embeds: [embeds.error('Invalid Roblox button payload.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const targetUser = await interaction.client.users.fetch(targetId).catch(() => null);
        const targetMember = targetUser
          ? await interaction.guild.members.fetch(targetUser.id).catch(() => null)
          : null;
        const nickname = decodeURIComponent(encodedQuery || '')
          || targetMember?.nickname
          || targetUser?.username;

        if (!nickname) {
          return interaction.reply({
            embeds: [embeds.error('Could not determine a Roblox username for this user.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const robloxData = await fetchRobloxProfileByUsername(nickname);
          if (!robloxData) {
            return interaction.editReply({
              embeds: [
                embeds.error(`No Roblox user found for **${nickname}**.`, interaction.guild),
              ],
            });
          }
          const embed = createRobloxEmbed(interaction.guild, robloxData, nickname);
          return interaction.editReply({ embeds: [embed] });
        } catch (err) {
          return interaction.editReply({
            embeds: [
              embeds.error(
                `An error occurred while fetching Roblox data: ${err.message}`,
                interaction.guild,
              ),
            ],
          });
        }
      }

      if (interaction.customId === 'portal_startshift') {
        if (!interaction.member.roles.cache.has(ROLE_IDS.moderationAccess)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have the required role to start a shift.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const result = db.startShift(interaction.guild.id, interaction.user.id, interaction.user.tag);
        if (!result) {
          return interaction.reply({
            embeds: [embeds.warning("You're already on shift! Use End Shift to clock out first.", interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const startedTs = Math.floor(new Date(result.startedAt).getTime() / 1000);
        return interaction.reply({
          embeds: [
            embeds
              .shift('  Shift Started', `Welcome back, ${interaction.user}! Your shift has begun.`, interaction.guild)
              .addFields({
                name: '  Started At',
                value: `<t:${startedTs}:T> (<t:${startedTs}:R>)`,
                inline: true,
              }),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'portal_endshift') {
        if (!interaction.member.roles.cache.has(ROLE_IDS.moderationAccess)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have the required role to end a shift.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const record = db.endShift(interaction.guild.id, interaction.user.id);
        if (!record) {
          return interaction.reply({
            embeds: [embeds.warning("You're not currently on shift.", interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const startedTs = Math.floor(new Date(record.startedAt).getTime() / 1000);
        const endedTs = Math.floor(new Date(record.endedAt).getTime() / 1000);
        return interaction.reply({
          embeds: [
            embeds
              .shift('  Shift Ended', `Thanks for your work, ${interaction.user}!`, interaction.guild)
              .addFields(
                { name: '  Duration', value: formatDuration(record.durationMs), inline: true },
                { name: '  Started', value: `<t:${startedTs}:T>`, inline: true },
                { name: '  Ended', value: `<t:${endedTs}:T>`, inline: true },
              ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'portal_shiftdetails') {
        if (!interaction.member.roles.cache.has(ROLE_IDS.moderationAccess)) {
          return interaction.reply({
            embeds: [embeds.error('You do not have the required role to view shift details.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const history = db.getUserShiftHistory(interaction.guild.id, interaction.user.id);
        const totalMs = history.reduce((sum, shift) => sum + shift.durationMs, 0);
        const active = db.getActiveShift(interaction.guild.id, interaction.user.id);

        const detailEmbed = embeds
          .shift('📋 Detailed Shift Overview', 'Your complete shift breakdown.', interaction.guild)
          .addFields(
            { name: 'Status', value: active ? '**On Shift**' : '**Off Shift**', inline: true },
            { name: 'Completed Shifts', value: `**${history.length}**`, inline: true },
            { name: 'Total Time', value: `**${formatDuration(totalMs)}**`, inline: true },
          );

        if (active) {
          const startedTs = Math.floor(new Date(active.startedAt).getTime() / 1000);
          detailEmbed.addFields({
            name: 'Current Shift',
            value: `Started <t:${startedTs}:F> (<t:${startedTs}:R>)`,
          });
        }

        if (history.length > 0) {
          const recent = history
            .slice(-10)
            .reverse()
            .map((shift) => {
              const startedTs = Math.floor(new Date(shift.startedAt).getTime() / 1000);
              return `ID \`${shift.id}\` · <t:${startedTs}:D> — **${formatDuration(shift.durationMs)}**`;
            });
          detailEmbed.addFields({
            name: 'Recent Shifts (last 10)',
            value: recent.join('\n'),
          });
        }

        return interaction.reply({
          embeds: [detailEmbed],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (isComponentExpired(interaction)) {
        return interaction.reply({
          embeds: [embeds.warning('These select menus have expired. Run the command again to refresh.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      const ownerId = getComponentOwnerId(interaction);
      if (ownerId && ownerId !== interaction.user.id) {
        return interaction.reply({
          embeds: [embeds.error('These select menus belong to someone else\'s command.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (interaction.customId.startsWith('staffmsg_type_select:')) {
        const actorId = interaction.customId.split(':')[1];
        if (actorId !== interaction.user.id) {
          return interaction.reply({ embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)], flags: MessageFlags.Ephemeral });
        }
        const recipientIds = getPendingStaffMessageSelection(interaction.guild.id, actorId);
        if (recipientIds.length === 0) {
          return interaction.reply({
            embeds: [embeds.warning('Recipient selection expired. Run `/staffmessage` again.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const messageType = interaction.values[0];
        const modal = new ModalBuilder()
          .setCustomId(`staffmsg_modal:${actorId}:${messageType}`)
          .setTitle('Staff Message')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Message Title')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('content')
                .setLabel('Message Content')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000),
            ),
          );
        return interaction.showModal(modal);
      }
      if (interaction.customId.startsWith('broadcastmsg_audience_select:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({ embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)], flags: MessageFlags.Ephemeral });
        }
        const audience = interaction.values[0];
        return interaction.reply({
          embeds: [{
            color: 0x5865f2,
            title: '📢 Broadcast — Select Type',
            description: `Audience: **${audience}**\n\nChoose the message type:`,
            timestamp: new Date().toISOString(),
          }],
          components: [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`broadcastmsg_type_select:${actorId}:${audience}`)
                .setPlaceholder('Select message type...')
                .addOptions(staffMessageCommand.MESSAGE_TYPES),
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
      if (interaction.customId.startsWith('broadcastmsg_type_select:')) {
        const parts = interaction.customId.split(':');
        const actorId = parts[1];
        const audience = parts[2];
        if (actorId !== interaction.user.id) {
          return interaction.reply({ embeds: [embeds.error('This panel is not assigned to you.', interaction.guild)], flags: MessageFlags.Ephemeral });
        }
        const messageType = interaction.values[0];
        const modal = new ModalBuilder()
          .setCustomId(`broadcastmsg_modal:${actorId}:${messageType}:${audience}`)
          .setTitle('Broadcast Message')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Message Title')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100),
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('content')
                .setLabel('Message Content')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000),
            ),
          );
        return interaction.showModal(modal);
      }
      if (allianceCommand.isAllianceSelectCustomId(interaction.customId)) {
        return allianceCommand.handleAllianceSelect(interaction);
      }
      if (helpCommand.isHelpCategorySelect(interaction.customId)) {
        return helpCommand.handleHelpCategorySelect(interaction);
      }
      if (shiftCommand.isShiftPanelSelect(interaction.customId)) {
        return shiftCommand.handleShiftPanelSelect(interaction);
      }
      if (automodCommand.isAutomodPanelSelect(interaction.customId)) {
        return automodCommand.handleAutomodPanelSelect(interaction);
      }
      if (staffInfractionCommand.isStaffInfractionPanelSelect(interaction.customId)) {
        return staffInfractionCommand.handleStaffInfractionPanelSelect(interaction);
      }
      if (interaction.customId.startsWith('rmr:')) {
        const [, sourceChannelId, messageId, authorId] = interaction.customId.split(':');
        const remainingMs = getReportCooldownRemainingMs(interaction.guild.id, interaction.user.id, Date.now());
        if (remainingMs > 0) {
          return interaction.reply({
            embeds: [embeds.warning(`You can submit another report in **${Math.ceil(remainingMs / 60_000)} minute(s)**.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const selectedReason = interaction.values?.[0] ?? 'other';
        const reasonLabel = REPORT_REASON_LABELS.get(selectedReason) ?? 'Other';
        const reportChannel = await interaction.guild.channels.fetch(REPORTS_CHANNEL_ID).catch(() => null);
        if (!reportChannel || !reportChannel.isTextBased()) {
          return interaction.reply({
            embeds: [embeds.error('Reports channel is not configured correctly.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const sourceChannel = await interaction.guild.channels.fetch(sourceChannelId).catch(() => null);
        if (!sourceChannel || !sourceChannel.isTextBased()) {
          return interaction.reply({
            embeds: [embeds.error('Original channel is no longer available.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const sourceMessage = await sourceChannel.messages.fetch(messageId).catch(() => null);
        const messageContent = sourceMessage?.content?.slice(0, 1000) || '(message unavailable)';
        const attachmentSummary = sourceMessage?.attachments?.size
          ? sourceMessage.attachments
            .map((attachment) => `• ${(attachment.name ?? 'attachment').slice(0, 120)}`)
            .slice(0, 3)
            .join('\n')
          : 'None';
        const jumpLink = sourceMessage?.url ?? 'Unavailable';

        const reportEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('🚨 Message Report Submitted')
          .setDescription(`**Reported Content**\n${messageContent}`)
          .addFields(
            { name: 'Reason', value: reasonLabel, inline: true },
            { name: 'Reporter', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Author', value: `<@${authorId}>`, inline: true },
            { name: 'Channel', value: `${sourceChannel}`, inline: true },
            { name: 'Attachments', value: attachmentSummary.slice(0, 1024), inline: false },
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
          content: `<@&${REPORTS_PING_ROLE_ID}>`,
          embeds: [reportEmbed],
          components: [actions],
        }).catch(() => null);
        touchReportCooldown(interaction.guild.id, interaction.user.id, Date.now());
        await sendReporterStatusDm({ user: interaction.user, guild: interaction.guild, status: 'submitted' });

        return interaction.update({
          embeds: [embeds.success('Report submitted to moderators.', interaction.guild)],
          components: [],
        });
      }
      if (interaction.customId === 'bakery_nav_select') {
        const requestedView = interaction.values[0] ?? 'home';
        const view = requestedView === 'codex' ? 'guide' : requestedView;
        let viewOptions = {};
        if (view === 'guide') viewOptions = getGuideState(interaction.guild.id, interaction.user.id);
        if (view === 'leaderboard') viewOptions = { metric: 'cookies' };
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, view, viewOptions);
        const components = economy.buildDashboardComponents(snapshot.user, view, { guild: interaction.guild, ...viewOptions });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId === 'bakery_leaderboard_metric') {
        const metric = interaction.values[0] ?? 'cookies';
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'leaderboard', { metric });
        const components = economy.buildDashboardComponents(snapshot.user, 'leaderboard', { metric, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_inventory_filter:')) {
        const page = Number.parseInt(interaction.customId.split(':')[1], 10) || 0;
        const rarityFilter = interaction.values[0] ?? 'all';
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'inventory', { page, rarityFilter });
        const components = economy.buildDashboardComponents(snapshot.user, 'inventory', { page, rarityFilter, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId === 'bakery_inventory_item') {
        const itemId = interaction.values[0] ?? '';
        if (!itemId) {
          return interaction.reply({
            embeds: [embeds.error('Unknown inventory item selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (itemId.startsWith(economy.GIFT_BOX_OPTION_PREFIX)) {
          const rewardBoxId = itemId.slice(economy.GIFT_BOX_OPTION_PREFIX.length);
          const result = economy.openRewardGift(interaction.guild.id, interaction.user.id, rewardBoxId);
          if (!result.ok) {
            return interaction.reply({
              embeds: [embeds.warning(result.reason, interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          const boxEmoji = economy.getRewardBoxEmoji(result.rewardBox, interaction.guild);
          const totalValue = result.grants.reduce((sum, grant) => {
            const rarity = economy.RARITY[grant.item.rarity];
            return sum + grant.item.baseValue * (rarity?.valueMultiplier ?? 1) * grant.quantity;
          }, 0);
          const grantsText = result.grants.length
            ? result.grants.map((grant) => `${economy.getItemEmoji(grant.item, interaction.guild)} **${grant.item.name}** ×${grant.quantity}`).join('\n')
            : 'No drops this time.';
          const openingEmbed = embeds.base(interaction.guild)
            .setColor(0xf1c40f)
            .setTitle(`${boxEmoji} Opened ${result.rewardBox.name}!`)
            .addFields(
              { name: '🎁 Contents', value: grantsText.slice(0, 1024) },
              { name: '💰 Total Value', value: `**${economy.toCookieNumber(totalValue)}** cookies`, inline: true },
            )
            .setTimestamp();
          const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
          const quickSellRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bakery_gift_sell_all:${rewardBoxId}`).setLabel('Quick Sell All Drops').setStyle(ButtonStyle.Success).setEmoji('💸'),
            new ButtonBuilder().setCustomId('bakery_nav:inventory').setLabel('View Inventory').setStyle(ButtonStyle.Secondary).setEmoji('🎒'),
          );
          return interaction.reply({ embeds: [openingEmbed], components: [quickSellRow], flags: MessageFlags.Ephemeral });
        }
        const item = economy.ITEM_MAP.get(itemId);
        if (!item) {
          return interaction.reply({
            embeds: [embeds.error('Unknown inventory item selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const inspect = economy.inspectItem(interaction.guild.id, interaction.user.id, itemId);
        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bakery_item_action:sell:${itemId}`).setLabel('Sell').setStyle(ButtonStyle.Success).setEmoji(economy.getButtonEmoji(interaction.guild, ['Paid_in_full', 'sell'], '💰')),
          new ButtonBuilder().setCustomId(`bakery_item_action:sellall:${itemId}`).setLabel('Sell All').setStyle(ButtonStyle.Success).setEmoji(economy.getButtonEmoji(interaction.guild, ['International_exchange', 'sell_all'], '💸')),
          new ButtonBuilder().setCustomId(`bakery_item_action:consume:${itemId}`).setLabel('Consume').setStyle(ButtonStyle.Primary).setEmoji(economy.getButtonEmoji(interaction.guild, ['Cookie_dough', 'consume'], '🍽️')),
          new ButtonBuilder().setCustomId(`bakery_item_action:inspect:${itemId}`).setLabel('Inspect').setStyle(ButtonStyle.Secondary).setEmoji(economy.getButtonEmoji(interaction.guild, ['Polymath', 'inspect'], '🔍')),
        );
        return interaction.reply({
          embeds: [economy.buildItemInspectEmbed(interaction.guild, inspect)],
          components: [actionRow],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'bakery_reward_gift_select') {
        const rewardBoxId = interaction.values[0];
        const result = economy.openRewardGift(interaction.guild.id, interaction.user.id, rewardBoxId);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const boxEmoji = economy.getRewardBoxEmoji(result.rewardBox, interaction.guild);
        const totalValue = result.grants.reduce((sum, grant) => {
          const rarity = economy.RARITY[grant.item.rarity];
          return sum + grant.item.baseValue * (rarity?.valueMultiplier ?? 1) * grant.quantity;
        }, 0);
        const grantsText = result.grants.length
          ? result.grants.map((grant) => `${economy.getItemEmoji(grant.item, interaction.guild)} **${grant.item.name}** ×${grant.quantity}`).join('\n')
          : 'No drops this time.';
        const openingEmbed = embeds.base(interaction.guild)
          .setColor(0xf1c40f)
          .setTitle(`${boxEmoji} Opened ${result.rewardBox.name}!`)
          .addFields(
            { name: '🎁 Contents', value: grantsText.slice(0, 1024) },
            { name: '💰 Total Value', value: `**${economy.toCookieNumber(totalValue)}** cookies`, inline: true },
          )
          .setTimestamp();
        const quickSellRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`bakery_gift_sell_all:${rewardBoxId}`).setLabel('Quick Sell All Drops').setStyle(ButtonStyle.Success).setEmoji('💸'),
          new ButtonBuilder().setCustomId('bakery_nav:inventory').setLabel('View Inventory').setStyle(ButtonStyle.Secondary).setEmoji('🎒'),
        );
        return interaction.reply({ embeds: [openingEmbed], components: [quickSellRow], flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === 'bakery_building_select') {
        const buildingId = interaction.values[0];
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'buildings', { buildingId });
        const components = economy.buildDashboardComponents(snapshot.user, 'buildings', { buildingId, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId === 'bakery_upgrade_select') {
        const upgradeId = interaction.values[0];
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'upgrades', { upgradeId });
        const components = economy.buildDashboardComponents(snapshot.user, 'upgrades', { upgradeId, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('bakery_guide_section:')) {
        const page = Number.parseInt(interaction.customId.split(':')[1], 10) || 0;
        const section = interaction.values[0] ?? DEFAULT_GUIDE_SECTION;
        setGuideState(interaction.guild.id, interaction.user.id, section, page);
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const embed = economy.buildDashboardEmbed(interaction.guild, snapshot.user, 'guide', { section, page });
        const components = economy.buildDashboardComponents(snapshot.user, 'guide', { section, page, guild: interaction.guild });
        return interaction.update({ embeds: [embed], components });
      }

      if (interaction.customId.startsWith('market_filter:')) {
        const page = Number.parseInt(interaction.customId.split(':')[1], 10) || 0;
        const rarityFilter = interaction.values[0] ?? 'all';
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const market = economy.getMarketplaceEmbed(interaction.guild, snapshot.guildState, snapshot.user, page, rarityFilter);
        const components = economy.getMarketplaceComponents(snapshot.guildState, market.pageIndex, rarityFilter);
        return interaction.update({ embeds: [market.embed], components });
      }

      if (interaction.customId === 'market_list_item_select') {
        const itemId = interaction.values[0];
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        if ((snapshot.user.inventory[itemId] ?? 0) <= 0) {
          return interaction.reply({
            embeds: [embeds.warning('You no longer have that item in your inventory.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return interaction.showModal(economy.modalForListItem(itemId));
      }

      if (interaction.customId === 'bakery_name_emoji_select') {
        const itemId = interaction.values[0];
        const bakeryName = getPendingBakeryRenameSelection(interaction.guild.id, interaction.user.id);
        if (!bakeryName) {
          return interaction.reply({
            embeds: [embeds.warning('Bakery rename timed out. Please run Set Bakery Name again.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        if ((snapshot.user.inventory[itemId] ?? 0) <= 0) {
          return interaction.reply({
            embeds: [embeds.warning('You no longer own that cookie.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const selectedEmoji = economy.getItemEmoji(itemId, interaction.guild);
        const setResult = economy.setBakeryIdentity(
          interaction.guild.id,
          interaction.user.id,
          bakeryName,
          selectedEmoji,
        );
        if (!setResult?.ok) {
          return interaction.reply({
            embeds: [embeds.error(setResult?.reason ?? 'Could not update bakery identity.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        clearPendingBakeryRenameSelection(interaction.guild.id, interaction.user.id);
        return interaction.update({
          embeds: [embeds.success(`Your bakery is now **${selectedEmoji} ${setResult.bakeryName}**. Branding complete.`, interaction.guild)],
          components: [],
        });
      }

      if (interaction.customId === 'market_select_listing') {
        const listingId = Number.parseInt(interaction.values[0], 10);
        const result = economy.buyListing(interaction.guild.id, interaction.user.id, listingId);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.warning(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const seller = await interaction.client.users.fetch(result.listing.sellerId).catch(() => null);
        if (seller) {
          const purchasedItem = economy.ITEM_MAP.get(result.listing.itemId);
          await seller.send({
            embeds: [
              embeds
                .success(
                  `Your marketplace listing was purchased in **${interaction.guild.name}**.`,
                  interaction.guild,
                )
                .addFields(
                  { name: 'Buyer', value: `${interaction.user} (\`${interaction.user.tag}\`)`, inline: true },
                  { name: 'Item', value: `${economy.getItemEmoji(purchasedItem ?? result.listing.itemId, interaction.guild)} ${purchasedItem?.name ?? result.listing.itemId}`, inline: true },
                  { name: 'Quantity', value: `${result.listing.quantity}`, inline: true },
                  { name: 'Sale Total', value: economy.toCookieNumber(result.totalPrice), inline: true },
                  { name: 'Marketplace Fee', value: economy.toCookieNumber(result.fee), inline: true },
                  { name: 'You Received', value: economy.toCookieNumber(result.payout), inline: true },
                ),
            ],
          }).catch(() => null);
        }
        const snapshot = economy.getUserSnapshot(interaction.guild.id, interaction.user.id);
        const market = economy.getMarketplaceEmbed(interaction.guild, snapshot.guildState, snapshot.user, 0, 'all');
        const components = economy.getMarketplaceComponents(snapshot.guildState, 0, 'all');
        return interaction.update({ embeds: [market.embed], components });
      }

      if (interaction.customId.startsWith('bakeadmin_action:')) {
        const [, actorId, targetId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin menu is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const action = interaction.values[0];
        if (['give_cookies', 'remove_cookies', 'start_event'].includes(action)) {
          const modal = economy.modalForAdminAction(actorId, targetId, action);
          return interaction.showModal(modal);
        }
        if (action === 'give_item') {
          const options = economy.ITEMS
            .map((item) => ({
              label: item.name.slice(0, 100),
              value: item.id,
              description: `ID: ${item.id}`.slice(0, 100),
              emoji: economy.getItemEmoji(item, interaction.guild),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
          const components = buildPagedStringSelectRows({
            customIdPrefix: `bakeadmin_item_select:${actorId}:${targetId}`,
            placeholderBase: 'Select item',
            options,
          });
          return interaction.reply({
            embeds: [embeds.info('Give Item', 'Select an item, then enter the quantity to grant.', interaction.guild)],
            components,
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'set_building') {
          const options = economy.BUILDINGS
            .map((building) => ({
              label: building.name.slice(0, 100),
              value: building.id,
              description: `ID: ${building.id}`.slice(0, 100),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
          const components = buildPagedStringSelectRows({
            customIdPrefix: `bakeadmin_building_select:${actorId}:${targetId}`,
            placeholderBase: 'Select building',
            options,
          });
          return interaction.reply({
            embeds: [embeds.info('Set Building Count', 'Select a building, then enter the new count.', interaction.guild)],
            components,
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'alliance_add_upgrade') {
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
          const components = buildPagedStringSelectRows({
            customIdPrefix: `bakeadmin_alliance_upgrade_alliance_select:${actorId}:${targetId}`,
            placeholderBase: 'Select alliance',
            options: allianceOptions,
          });
          return interaction.reply({
            embeds: [embeds.info('Alliance: Grant Upgrade', 'Select the alliance to update.', interaction.guild)],
            components,
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'alliance_delete') {
          const allianceOptions = alliances.listAlliances(interaction.guild.id)
            .map((alliance) => ({
              label: alliance.name.slice(0, 100),
              value: alliance.id,
              description: `ID ${alliance.id} • Members ${alliance.members.length}`.slice(0, 100),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
          if (!allianceOptions.length) {
            return interaction.reply({
              embeds: [embeds.warning('No alliances found to delete.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          const components = buildPagedStringSelectRows({
            customIdPrefix: `bakeadmin_alliance_delete_select:${actorId}:${targetId}`,
            placeholderBase: 'Select alliance to delete',
            options: allianceOptions,
          });
          return interaction.reply({
            embeds: [embeds.warning('Select an alliance, then confirm deletion in the next step.', interaction.guild)],
            components,
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'set_log_channel') {
          return interaction.reply({
            embeds: [embeds.info('Set Log Channel', 'Choose the bake admin log channel.', interaction.guild)],
            components: [
              new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                  .setCustomId(`bakeadmin_log_channel_select:${actorId}:${targetId}`)
                  .setPlaceholder('Select a channel')
                  .setMinValues(1)
                  .setMaxValues(1),
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'unlock_upgrade') {
          return interaction.reply({
            embeds: [embeds.info('Unlock Upgrade', 'Select upgrade to unlock.', interaction.guild)],
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`bakeadmin_upgrade_select:${actorId}:${targetId}`)
                  .setPlaceholder('Select upgrade')
                  .addOptions(economy.UPGRADES.slice(0, 25).map((upgrade) => ({ label: upgrade.name.slice(0, 100), value: upgrade.id }))),
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'grant_achievement') {
          return interaction.reply({
            embeds: [embeds.info('Grant Achievement', 'Select milestone to grant.', interaction.guild)],
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`bakeadmin_achievement_select:${actorId}:${targetId}`)
                  .setPlaceholder('Select achievement')
                  .addOptions(economy.ACHIEVEMENTS.slice(0, 25).map((achievement) => ({
                    label: achievement.name.slice(0, 100),
                    value: achievement.id,
                    emoji: economy.getAchievementEmoji(achievement, interaction.guild),
                  }))),
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'set_rank') {
          return interaction.reply({
            embeds: [embeds.info('Set Rank', 'Select the rank to set for this user.', interaction.guild)],
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`bakeadmin_rank_select:${actorId}:${targetId}`)
                  .setPlaceholder('Select rank')
                  .addOptions(economy.RANKS.slice(0, 25).map((rank) => ({
                    label: rank.name.slice(0, 100),
                    value: rank.id,
                    emoji: economy.getRankEmoji(rank, interaction.guild),
                  }))),
              ),
            ],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'grant_reward_box') {
          return interaction.reply({
            embeds: [embeds.info('Grant Reward Gift Box', 'Select which reward gift box to grant.', interaction.guild)],
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                  .setCustomId(`bakeadmin_reward_box_select:${actorId}:${targetId}`)
                  .setPlaceholder('Select reward gift box')
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
        if (action === 'trigger_golden') {
          economy.adminForceGolden(interaction.guild.id, targetId);
          await sendBakeAdminLog(interaction, targetId, 'Trigger Golden Cookie', 'Forced Golden Cookie on next /bake');
          return interaction.reply({
            embeds: [embeds.success(`Forced Golden Cookie for <@${targetId}> on next bake.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'ban_bake' || action === 'unban_bake') {
          const banned = action === 'ban_bake';
          economy.adminSetBakeBan(interaction.guild.id, targetId, banned);
          await sendBakeAdminLog(interaction, targetId, banned ? 'Ban Bake Commands' : 'Unban Bake Commands', banned ? 'User blocked from /bake and Bake Again' : 'User unblocked for /bake and Bake Again');
          return interaction.reply({
            embeds: [embeds.success(`${banned ? 'Banned' : 'Unbanned'} <@${targetId}> ${banned ? 'from' : 'for'} baking commands.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'reset_user') {
          const modal = new ModalBuilder()
            .setCustomId(`bakeadmin_modal:${actorId}:${targetId}:reset_user`)
            .setTitle('Reset User Data')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('confirm')
                  .setLabel('Type RESET to confirm')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true),
              ),
            );
          return interaction.showModal(modal);
        }
        if (action === 'view_user') {
          const statsEmbed = economy.getUserDataEmbed(interaction.guild, targetId);
          const refresh = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bakeadmin_view_refresh:${targetId}`).setLabel('Refresh').setStyle(ButtonStyle.Secondary),
          );
          return interaction.reply({
            embeds: [statsEmbed],
            components: [refresh],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      if (interaction.customId.startsWith('bakeadmin_global_action:')) {
        const [, actorId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin dashboard is not assigned to you.', interaction.guild)],
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
                      special_cookie_hunt: '🍪',
                      golden_fever: '✨',
                      sugar_rush: '⚡',
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
        await sendBakeAdminLog(interaction, targetId, 'Unlock Upgrade', `Upgrade: ${upgradeId}`);
        return interaction.reply({
          embeds: [embeds.success(`Unlocked upgrade \`${upgradeId}\` for <@${targetId}>.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
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
        const components = buildPagedStringSelectRows({
          customIdPrefix: `bakeadmin_alliance_upgrade_select:${actorId}:${targetId}:${allianceId}`,
          placeholderBase: 'Select upgrade',
          options: alliances.ALLIANCE_STORE_UPGRADES
            .map((upgrade) => ({
              label: upgrade.name.slice(0, 100),
              value: upgrade.id,
              description: `ID: ${upgrade.id}`.slice(0, 100),
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        });
        return interaction.reply({
          embeds: [embeds.info('Alliance: Grant Upgrade', `Selected alliance: **${alliance.name}** (\`${alliance.id}\`).`, interaction.guild)],
          components,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakeadmin_alliance_upgrade_select:')) {
        const [, actorId, targetId, allianceId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin panel is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const upgradeId = interaction.values[0];
        const result = alliances.adminGrantAllianceUpgrade(interaction.guild.id, allianceId, upgradeId);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.error(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const upgrade = result.upgrade;
        await sendBakeAdminLog(interaction, targetId, 'Alliance: Grant Upgrade', `${result.alliance.name} (${result.alliance.id}) -> ${upgrade?.name ?? upgradeId}`);
        return interaction.reply({
          embeds: [embeds.success(`Granted alliance upgrade **${upgrade?.name ?? upgradeId}** to **${result.alliance.name}** (\`${result.alliance.id}\`).`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
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
        await sendBakeAdminLog(interaction, targetId, 'Grant Achievement', `Achievement: ${achievementId}`);
        return interaction.reply({
          embeds: [embeds.success(`Granted achievement \`${achievementId}\` to <@${targetId}>.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
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
        await sendBakeAdminLog(interaction, targetId, 'Set Rank', `Rank: ${rankId}`);
        return interaction.reply({
          embeds: [embeds.success(`Set rank for <@${targetId}> to ${economy.getRankEmoji(rank, interaction.guild)} **${rank?.name ?? rankId}**.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
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
        if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex >= UPDATE_LOGS.length) {
          return interaction.reply({
            embeds: [embeds.error('Invalid update log selection.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const selected = UPDATE_LOGS[selectedIndex];
        const updatedEmbed = createUpdateEmbed(interaction.guild, botVersion, selected, selectedIndex);
        return interaction.update({ embeds: [updatedEmbed], components: interaction.message.components });
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
        const [, globalActionSelectRow] = economy.buildBakeAdminDashboardComponents(interaction.user.id);
        const globalActionRow = globalActionSelectRow ? [globalActionSelectRow] : [];
        const components = [...userActionRows, ...globalActionRow];
        return interaction.update({ embeds: [embed], components });
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
      if (interaction.customId.startsWith('ctx_report_message:')) {
        const [, sourceChannelId, messageId, authorId] = interaction.customId.split(':');
        const remainingMs = getReportCooldownRemainingMs(interaction.guild.id, interaction.user.id, Date.now());
        if (remainingMs > 0) {
          return interaction.reply({
            embeds: [embeds.warning(`You can submit another report in **${Math.ceil(remainingMs / 60_000)} minute(s)**.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const category = interaction.fields.getTextInputValue('category').trim();
        const reason = interaction.fields.getTextInputValue('reason').trim();
        const reportChannel = await interaction.guild.channels.fetch(REPORTS_CHANNEL_ID).catch(() => null);
        if (!reportChannel || !reportChannel.isTextBased()) {
          return interaction.reply({
            embeds: [embeds.error('Reports channel is not configured correctly.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        const sourceChannel = await interaction.guild.channels.fetch(sourceChannelId).catch(() => null);
        if (!sourceChannel || !sourceChannel.isTextBased()) {
          return interaction.reply({
            embeds: [embeds.error('Original channel is no longer available.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const sourceMessage = await sourceChannel.messages.fetch(messageId).catch(() => null);
        const messageContent = sourceMessage?.content?.slice(0, 1000) || '(message unavailable)';
        const attachmentSummary = sourceMessage?.attachments?.size
          ? sourceMessage.attachments
            .map((attachment) => `• ${(attachment.name ?? 'attachment').slice(0, 120)}`)
            .slice(0, 3)
            .join('\n')
          : 'None';
        const jumpLink = sourceMessage?.url ?? 'Unavailable';

        const reportEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle('🚨 Message Report Submitted')
          .setDescription(`**Reported Content**\n${messageContent}`)
          .addFields(
            { name: 'Category', value: category.slice(0, 100), inline: true },
            { name: 'Reporter', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Author', value: `<@${authorId}>`, inline: true },
            { name: 'Channel', value: `${sourceChannel}`, inline: true },
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
          content: `<@&${REPORTS_PING_ROLE_ID}>`,
          embeds: [reportEmbed],
          components: [actions],
        }).catch(() => null);
        touchReportCooldown(interaction.guild.id, interaction.user.id, Date.now());
        await sendReporterStatusDm({ user: interaction.user, guild: interaction.guild, status: 'submitted' });

        return interaction.reply({
          embeds: [embeds.success('Report submitted to moderators.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('report_dismiss_reason:')) {
        const [, reportMessageId, reporterId] = interaction.customId.split(':');
        const dismissReason = interaction.fields.getTextInputValue('reason').trim();
        if (!dismissReason) {
          return interaction.reply({
            embeds: [embeds.error('A dismissal reason is required.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
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
        await interaction.reply({
          embeds: [embeds.success('Report dismissed with a recorded reason.', interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
        if (reporterId) {
          const reporter = await interaction.client.users.fetch(reporterId).catch(() => null);
          await sendReporterStatusDm({
            user: reporter,
            guild: interaction.guild,
            status: 'dismissed',
            reportReason: dismissReason,
          });
        }
        return;
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
        await sendBakeAdminLog(interaction, targetId, 'Grant Reward Gift Box', `${rewardBoxId} x${quantity}`);
        return interaction.reply({
          embeds: [embeds.success(`Granted ${economy.getRewardBoxEmoji(rewardBox, interaction.guild)} **${quantity}x ${rewardBox?.name ?? rewardBoxId}** to <@${targetId}>.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
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
        await sendBakeAdminLog(interaction, targetId, 'Give Item', `${itemId} x${quantity}`);
        return interaction.reply({
          embeds: [embeds.success(`Gave **${quantity}x ${economy.ITEM_MAP.get(itemId)?.name ?? itemId}** to <@${targetId}>.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
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
        await sendBakeAdminLog(interaction, targetId, 'Set Building Count', `${buildingId}=${count}`);
        return interaction.reply({
          embeds: [embeds.success(`Set **${buildingId}** to **${count}** for <@${targetId}>.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakeadmin_alliance_delete_modal:')) {
        const [, actorId, targetId, allianceId] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin modal is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const confirm = interaction.fields.getTextInputValue('confirm').trim();
        if (confirm !== 'DELETE') {
          return interaction.reply({
            embeds: [embeds.warning('Delete cancelled. Type `DELETE` exactly to confirm.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const result = alliances.adminDeleteAlliance(interaction.guild.id, allianceId);
        if (!result.ok) {
          return interaction.reply({
            embeds: [embeds.error(result.reason, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await sendBakeAdminLog(interaction, targetId, 'Alliance: Delete', `${result.allianceName} (${result.allianceId}), members removed: ${result.memberCount}`);
        return interaction.reply({
          embeds: [embeds.success(`Deleted alliance **${result.allianceName}** (\`${result.allianceId}\`).`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakeadmin_gift_all_modal:')) {
        const parts = interaction.customId.split(':');
        const actorId = parts[1];
        const rewardBoxId = parts[2];
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
        const count = economy.adminGiftAllUsers(interaction.guild.id, rewardBoxId, quantity, giftMessage, interaction.user.tag);
        if (!count) {
          return interaction.reply({
            embeds: [embeds.warning('No tracked users found or invalid box.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        await sendBakeAdminLog(interaction, interaction.user.id, 'Gift All Users', `${rewardBoxId} x${quantity} — ${count} users`);
        return interaction.reply({
          embeds: [embeds.success(`Gifted ${economy.getRewardBoxEmoji(rewardBox, interaction.guild)} **${quantity}x ${rewardBox?.name ?? rewardBoxId}** to **${count}** tracked user(s).`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId.startsWith('bakeadmin_global_modal:')) {
        const parts = interaction.customId.split(':');
        const actorId = parts[1];
        const action = parts[2];
        const extraParam = parts[3] ?? null; // e.g. event id for start_event
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin modal is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'start_event') {
          const durationRaw = interaction.fields.getTextInputValue('durationMinutes').trim();
          const durationMinutes = Number.parseInt(durationRaw, 10);
          if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
            return interaction.reply({
              embeds: [embeds.error('Duration must be a whole number between 1 and 1440 minutes.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          const eventId = extraParam ?? 'special_cookie_hunt';
          const eventDef = economy.COOKIE_EVENT_DEFINITIONS.find((e) => e.id === eventId) ?? economy.COOKIE_EVENT_DEFINITIONS[0];
          const event = economy.adminStartEvent(interaction.guild.id, durationMinutes, eventId);
          await sendBakeAdminLog(interaction, actorId, 'Global: Start Event', `${eventDef.name} for ${durationMinutes} minute(s)`);
          await sendBakeEventStartLog(interaction, eventDef, durationMinutes, event.startedAt, event.endsAt);
          return interaction.reply({
            embeds: [embeds.success(`Started **${eventDef.name}** for **${durationMinutes} minute${durationMinutes === 1 ? '' : 's'}**.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'reset_economy') {
          const confirm = interaction.fields.getTextInputValue('confirm').trim();
          if (confirm !== 'RESET ALL') {
            return interaction.reply({
              embeds: [embeds.warning('Reset cancelled. Type `RESET ALL` exactly next time.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          economy.adminResetGuildEconomy(interaction.guild.id);
          await sendBakeAdminLog(interaction, actorId, 'Global: Reset Economy', 'Full guild bakery economy reset');
          const dashboardEmbed = economy.buildBakeAdminDashboardEmbed(interaction.guild, actorId);
          const dashboardComponents = economy.buildBakeAdminDashboardComponents(actorId);
          return interaction.reply({
            embeds: [
              embeds.success('Entire bakery economy reset completed for this guild.', interaction.guild),
              dashboardEmbed,
            ],
            components: dashboardComponents,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      if (interaction.customId.startsWith('bakeadmin_modal:')) {
        const [, actorId, targetId, action] = interaction.customId.split(':');
        if (actorId !== interaction.user.id) {
          return interaction.reply({
            embeds: [embeds.error('This admin modal is not assigned to you.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'give_cookies' || action === 'remove_cookies') {
          const amountRaw = interaction.fields.getTextInputValue('amount').trim();
          const amount = Number.parseInt(amountRaw, 10);
          if (!Number.isInteger(amount) || amount <= 0) {
            return interaction.reply({
              embeds: [embeds.error('Amount must be a positive integer.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          const delta = action === 'remove_cookies' ? -amount : amount;
          economy.adminGiveCookies(interaction.guild.id, targetId, delta);
          await sendBakeAdminLog(interaction, targetId, action === 'remove_cookies' ? 'Remove Cookies' : 'Give Cookies', `${delta} cookies`);
          return interaction.reply({
            embeds: [embeds.success(`${delta >= 0 ? 'Gave' : 'Removed'} **${economy.toCookieNumber(Math.abs(delta))}** cookies ${delta >= 0 ? 'to' : 'from'} <@${targetId}>.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'reset_user') {
          const confirm = interaction.fields.getTextInputValue('confirm').trim();
          if (confirm !== 'RESET') {
            return interaction.reply({
              embeds: [embeds.warning('Reset cancelled. Type `RESET` exactly next time.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          economy.adminResetUser(interaction.guild.id, targetId);
          await sendBakeAdminLog(interaction, targetId, 'Reset User', 'Full economy reset');
          return interaction.reply({
            embeds: [embeds.success(`Reset all baking data for <@${targetId}>.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        if (action === 'start_event') {
          const durationRaw = interaction.fields.getTextInputValue('durationMinutes').trim();
          const durationMinutes = Number.parseInt(durationRaw, 10);
          if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
            return interaction.reply({
              embeds: [embeds.error('Duration must be a whole number between 1 and 1440 minutes.', interaction.guild)],
              flags: MessageFlags.Ephemeral,
            });
          }
          const eventIdParam = interaction.customId.split(':')[4] ?? 'special_cookie_hunt';
          const eventDef = economy.COOKIE_EVENT_DEFINITIONS.find((e) => e.id === eventIdParam) ?? economy.COOKIE_EVENT_DEFINITIONS[0];
          const event = economy.adminStartEvent(interaction.guild.id, durationMinutes, eventDef.id);
          await sendBakeAdminLog(interaction, targetId, 'Start Event', `${eventDef.name} for ${durationMinutes} minute(s)`);
          await sendBakeEventStartLog(interaction, eventDef, durationMinutes, event.startedAt, event.endsAt);
          return interaction.reply({
            embeds: [embeds.success(`Started **${eventDef.name}** for **${durationMinutes} minute${durationMinutes === 1 ? '' : 's'}**.`, interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      // ── Staff Message modal submit ─────────────────────────────────────────
      if (interaction.customId.startsWith('staffmsg_modal:')) {
        const parts = interaction.customId.split(':');
        const actorId = parts[1];
        const messageType = parts[2];
        const recipientIds = getPendingStaffMessageSelection(interaction.guild.id, actorId);
        const legacyRecipientIds = (parts[3] ?? '').split(',').filter(Boolean);
        const finalRecipientIds = recipientIds.length > 0 ? recipientIds : legacyRecipientIds;
        if (actorId !== interaction.user.id) {
          return interaction.reply({ embeds: [embeds.error('This modal is not assigned to you.', interaction.guild)], flags: MessageFlags.Ephemeral });
        }
        if (!staffMessageCommand.hasSeniorModPlus(interaction.member)) {
          return interaction.reply({ embeds: [embeds.error('Permission denied.', interaction.guild)], flags: MessageFlags.Ephemeral });
        }
        if (finalRecipientIds.length === 0) {
          return interaction.reply({
            embeds: [embeds.warning('Recipient selection expired. Run `/staffmessage` again.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }
        const title = interaction.fields.getTextInputValue('title').trim();
        const content = interaction.fields.getTextInputValue('content').trim();
        for (const userId of finalRecipientIds) {
          economy.addPendingMessage(interaction.guild.id, userId, {
            type: 'staff_message',
            messageType,
            title,
            content,
            from: interaction.user.tag,
            claimed: true,
          });
        }
        clearPendingStaffMessageSelection(interaction.guild.id, actorId);
        const recipientMentions = finalRecipientIds.map((id) => `<@${id}>`).join(', ');
        return interaction.reply({
          embeds: [embeds.success(`Message sent to ${recipientMentions}.`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }

      // ── Broadcast Message modal submit ────────────────────────────────────
      if (interaction.customId.startsWith('broadcastmsg_modal:')) {
        const parts = interaction.customId.split(':');
        const actorId = parts[1];
        const messageType = parts[2];
        const audience = parts[3];
        if (actorId !== interaction.user.id) {
          return interaction.reply({ embeds: [embeds.error('This modal is not assigned to you.', interaction.guild)], flags: MessageFlags.Ephemeral });
        }
        if (!broadcastMessageCommand.hasLeadManagement(interaction.member)) {
          return interaction.reply({ embeds: [embeds.error('Permission denied.', interaction.guild)], flags: MessageFlags.Ephemeral });
        }
        const title = interaction.fields.getTextInputValue('title').trim();
        const content = interaction.fields.getTextInputValue('content').trim();

        let targetUserIds = [];
        if (audience === 'everyone') {
          targetUserIds = economy.getAllTrackedUserIds(interaction.guild.id);
        } else if (audience.startsWith('role:')) {
          const roleKey = audience.slice(5);
          let roleSet;
          if (roleKey === 'moderation') roleSet = broadcastMessageCommand.MODERATION_ROLE_IDS;
          else if (roleKey === 'sid') roleSet = broadcastMessageCommand.SID_ROLE_IDS;
          else if (roleKey === 'osc') roleSet = broadcastMessageCommand.OSC_ROLE_IDS;
          else if (roleKey === 'facility') roleSet = broadcastMessageCommand.FACILITY_ROLE_IDS;
          else if (roleKey === 'all_staff') roleSet = broadcastMessageCommand.ALL_STAFF_ROLE_IDS;
          if (roleSet) {
            await interaction.guild.members.fetch().catch(() => null);
            for (const member of interaction.guild.members.cache.values()) {
              if ([...roleSet].some((roleId) => member.roles.cache.has(roleId))) {
                targetUserIds.push(member.id);
              }
            }
          }
        }

        if (targetUserIds.length === 0) {
          return interaction.reply({
            embeds: [embeds.warning('No matching users found for the selected audience.', interaction.guild)],
            flags: MessageFlags.Ephemeral,
          });
        }

        for (const userId of targetUserIds) {
          economy.addPendingMessage(interaction.guild.id, userId, {
            type: 'staff_message',
            messageType,
            title,
            content,
            from: interaction.user.tag,
            claimed: true,
          });
        }

        return interaction.reply({
          embeds: [embeds.success(`Broadcast sent to **${targetUserIds.length}** user(s) (audience: *${audience}*).`, interaction.guild)],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // ── Autocomplete ────────────────────────────────────────────────────────
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
