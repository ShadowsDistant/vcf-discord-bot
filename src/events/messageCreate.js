'use strict';

const { Events, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');
const { scanMessage, getCategoryLabel, isCategoryEnabledByDefault } = require('../utils/automod');
const { hasModLevel, MOD_LEVEL } = require('../utils/permissions');
const embeds = require('../utils/embeds');
const { hasModerationAccessRole } = require('../utils/roles');
const analytics = require('../utils/analytics');
const { sendModerationActionDm } = require('../utils/moderationNotifications');
const { fetchLogChannel } = require('../utils/logChannels');

/** Channel ID for the counting game */
const COUNTING_CHANNEL_ID = '1436101746928914675';

/**
 * Safely evaluate a math expression string (numbers and basic operators only).
 * Returns the numeric result or null if the expression is invalid/unsafe.
 * @param {string} expr
 * @returns {number|null}
 */
function safeEvalMath(expr) {
  const cleaned = expr.trim().replace(/\s+/g, '');
  // Only allow digits, +, -, *, /, %, (, ), decimal points, and power ** operator
  if (!/^[\d+\-*/%.()e^]+$/.test(cleaned)) return null;
  // Replace ^ with ** for power (JS uses **)
  const normalized = cleaned.replace(/\^/g, '**');
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`'use strict'; return (${normalized});`);
    const result = fn();
    if (typeof result !== 'number' || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

/**
 * Returns the list of category IDs that are enabled for a guild's automod config.
 * When a category key is absent, it defaults to ON (enabled).
 */
function getEnabledCategories(config) {
  const { getCategoryIds } = require('../utils/automod');
  const allCats = getCategoryIds();
  const categoryMap = config.categories ?? {};
  return allCats.filter((c) => {
    if (Object.prototype.hasOwnProperty.call(categoryMap, c)) return categoryMap[c] !== false;
    return isCategoryEnabledByDefault(c);
  });
}

function isModerationStaff(member, guildId) {
  if (hasModerationAccessRole(member) || hasModLevel(member, guildId, MOD_LEVEL.moderator)) {
    return true;
  }

  return member.permissions.has([
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
  ]);
}

function getMessageScanContent(message) {
  const parts = [];
  if (message.content) parts.push(message.content);

  const attachmentText = message.attachments
    .map((a) => [a.name, a.description].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' ');
  if (attachmentText) parts.push(attachmentText);

  const stickerText = message.stickers
    .map((s) => [s.name, s.description].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' ');
  if (stickerText) parts.push(stickerText);

  return parts.join('\n').trim();
}

/**
 * Handle the counting game for messages in the counting channel.
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>} true if the message was handled (consumed), false otherwise
 */
async function handleCountingMessage(message) {
  if (message.channel.id !== COUNTING_CHANNEL_ID) return false;

  const content = message.content.trim();
  if (!content) return false;

  const guildId = message.guild.id;
  const state = db.getCountingState(guildId);
  const expectedCount = state.count + 1;

  // Try to parse the message as a number or math expression
  const result = safeEvalMath(content);

  if (result === null) {
    // Not a number/math expression — reset, react with ❌, and notify
    db.resetCountingState(guildId);
    await message.react('❌').catch(() => null);
    await message.channel.send(
      `❌ ${message.author}, only numbers or math expressions are allowed in the counting channel. The count has been reset to **0**. Start again from **1**!`,
    ).catch(() => null);
    return true;
  }

  // Round to avoid floating point issues (e.g. 1.9999999 ≈ 2)
  const rounded = Math.round(result * 1e9) / 1e9;
  if (!Number.isInteger(rounded)) {
    db.resetCountingState(guildId);
    await message.react('❌').catch(() => null);
    await message.channel.send(
      `❌ ${message.author}, counting must increase by **whole numbers** only. The count has been reset to **0**. Start again from **1**!`,
    ).catch(() => null);
    return true;
  }

  if (rounded !== expectedCount) {
    // Wrong number — reset the count and react with ❌
    const wasDouble = message.author.id === state.lastUserId;
    db.resetCountingState(guildId);
    await message.react('❌').catch(() => null);
    const reason = wasDouble
      ? `${message.author} tried to count twice in a row!`
      : `${message.author} said **${rounded}** but the next number was **${expectedCount}**!`;
    await message.channel.send(
      `❌ ${reason} The count has been reset to **0**. Start again from **1**!`,
    ).catch(() => null);
    return true;
  }

  // Prevent same user counting twice in a row
  if (message.author.id === state.lastUserId) {
    db.resetCountingState(guildId);
    await message.react('❌').catch(() => null);
    await message.channel.send(
      `❌ ${message.author}, you can't count twice in a row! The count has been reset to **0**. Start again from **1**!`,
    ).catch(() => null);
    return true;
  }

  // Correct number — update state and react with ✅
  db.setCountingState(guildId, {
    count: expectedCount,
    lastUserId: message.author.id,
    lastMessageId: message.id,
  });
  await message.react('✅').catch(() => null);

  // Celebrate milestones
  if (expectedCount % 100 === 0) {
    await message.channel.send(`🎉 **${expectedCount}!** Amazing work everyone!`).catch(() => null);
  }

  return true;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Ignore bots and DMs
    if (message.author.bot || !message.guild) return;
    const now = Date.now();
    analytics.recordMessage(message.guild.id, message.channel.id, now);
    analytics.recordUserMessage(message.guild.id, message.author.id, message.channel.id, now);

    // Handle counting channel
    if (message.channel.id === COUNTING_CHANNEL_ID) {
      await handleCountingMessage(message);
      return;
    }

    const guildId = message.guild.id;
    const automodConfig = db.getAutomodConfig(guildId);

    // Automod disabled for this guild
    if (!automodConfig.enabled) return;

    const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    // Exempt moderation staff
    if (isModerationStaff(member, guildId)) return;

    // Exempt any additional roles the config specifies
    const exemptRoles = automodConfig.exemptRoles ?? [];
    if (exemptRoles.length > 0 && exemptRoles.some((rId) => member.roles.cache.has(rId))) return;

    const enabledCats = getEnabledCategories(automodConfig);
    if (!enabledCats.length) return;

    const content = getMessageScanContent(message);
    if (!content) return;

    const result = scanMessage(content, enabledCats);
    if (!result.triggered) return;

    // ── Apply punishment ─────────────────────────────────────────────────────
    const punishment = automodConfig.punishment ?? 'delete';

    // Delete the offending message
    await message.delete().catch(() => null);

    // Build the DM warning to the user
    const categoryLabel = getCategoryLabel(result.category);
    try {
      await message.author.send({
        embeds: [
          embeds
            .warning(
              `Your message in **${message.guild.name}** was removed because it violated the **${categoryLabel}** automod filter.\n\nPlease review the server rules to avoid further action.`,
            )
            .setTitle('AutoMod — Message Removed'),
        ],
      });
    } catch {
      // User has DMs disabled — that's fine
    }

    // Apply additional punishment if configured
    if ((punishment === 'delete_timeout' || punishment === 'timeout') && member.moderatable) {
      const timeoutMs = automodConfig.timeoutDuration ?? 300_000; // default 5 min
      await sendModerationActionDm({
        user: message.author,
        guild: message.guild,
        action: 'Timeout',
        reason: `AutoMod: ${categoryLabel} filter triggered`,
        moderatorTag: 'AutoMod',
        duration: `${Math.floor(timeoutMs / 60_000)} minute(s)`,
      });
      await member
        .timeout(timeoutMs, `AutoMod: ${categoryLabel} filter triggered`)
        .catch(() => null);
    }

    if (punishment === 'delete_kick' && member.kickable) {
      await sendModerationActionDm({
        user: message.author,
        guild: message.guild,
        action: 'Kick',
        reason: `AutoMod: ${categoryLabel} filter triggered`,
        moderatorTag: 'AutoMod',
      });
      await member.kick(`AutoMod: ${categoryLabel} filter triggered`).catch(() => null);
    }

    // ── Log to mod-log channel ───────────────────────────────────────────────
    {
      const logChannel = await fetchLogChannel(message.guild, 'automod');
      if (logChannel) {
        const punishmentLabel = {
          delete: 'Message deleted',
          delete_timeout: 'Message deleted + timeout',
          delete_kick: 'Message deleted + kick',
          timeout: 'Timeout',
        }[punishment] ?? punishment;

        const logEmbed = embeds
          .base(message.guild)
          .setColor(0xed4245)
          .setTitle('AutoMod Action')
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .addFields(
            {
              name: 'User',
              value: `${message.author} (\`${message.author.tag}\`)`,
              inline: true,
            },
            { name: 'Category', value: categoryLabel, inline: true },
            { name: 'Action', value: punishmentLabel, inline: true },
            {
              name: 'Message',
              value: content.length > 1000 ? `${content.slice(0, 997)}…` : content,
            },
            { name: 'Channel', value: `${message.channel}`, inline: true },
          );

        await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
      }
    }
  },
};
