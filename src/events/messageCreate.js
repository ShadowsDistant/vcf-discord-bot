'use strict';

const { Events, AuditLogEvent } = require('discord.js');
const db = require('../utils/database');
const { scanMessage, getCategoryLabel } = require('../utils/automod');
const { hasModLevel, MOD_LEVEL } = require('../utils/permissions');
const embeds = require('../utils/embeds');

/**
 * Returns the list of category IDs that are enabled for a guild's automod config.
 * When a category key is absent, it defaults to ON (enabled).
 */
function getEnabledCategories(config) {
  const { getCategoryIds } = require('../utils/automod');
  const allCats = getCategoryIds();
  const categoryMap = config.categories ?? {};
  return allCats.filter((c) => categoryMap[c] !== false);
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    // Ignore bots and DMs
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const automodConfig = db.getAutomodConfig(guildId);

    // Automod disabled for this guild
    if (!automodConfig.enabled) return;

    const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    // Exempt moderators, senior mods, and management
    if (hasModLevel(member, guildId, MOD_LEVEL.moderator)) return;

    // Exempt any additional roles the config specifies
    const exemptRoles = automodConfig.exemptRoles ?? [];
    if (exemptRoles.length > 0 && exemptRoles.some((rId) => member.roles.cache.has(rId))) return;

    const enabledCats = getEnabledCategories(automodConfig);
    if (!enabledCats.length) return;

    const content = message.content;
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
            .setTitle('⚠️  AutoMod — Message Removed'),
        ],
      });
    } catch {
      // User has DMs disabled — that's fine
    }

    // Apply additional punishment if configured
    if ((punishment === 'delete_timeout' || punishment === 'timeout') && member.moderatable) {
      const timeoutMs = automodConfig.timeoutDuration ?? 300_000; // default 5 min
      await member
        .timeout(timeoutMs, `AutoMod: ${categoryLabel} filter triggered`)
        .catch(() => null);
    }

    if (punishment === 'delete_kick' && member.kickable) {
      await member.kick(`AutoMod: ${categoryLabel} filter triggered`).catch(() => null);
    }

    // ── Log to mod-log channel ───────────────────────────────────────────────
    const logChannelId = automodConfig.logChannelId ?? db.getConfig(guildId).logChannelId;
    if (logChannelId) {
      const logChannel = message.guild.channels.cache.get(logChannelId);
      if (logChannel?.isTextBased()) {
        const punishmentLabel = {
          delete: 'Message deleted',
          delete_timeout: 'Message deleted + timeout',
          delete_kick: 'Message deleted + kick',
          timeout: 'Timeout',
        }[punishment] ?? punishment;

        const logEmbed = embeds
          .base(message.guild)
          .setColor(0xed4245)
          .setTitle('🤖  AutoMod Action')
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .addFields(
            {
              name: '👤  User',
              value: `${message.author} (\`${message.author.tag}\`)`,
              inline: true,
            },
            { name: '📂  Category', value: categoryLabel, inline: true },
            { name: '⚖️  Action', value: punishmentLabel, inline: true },
            {
              name: '💬  Message',
              value: content.length > 1000 ? `${content.slice(0, 997)}…` : content,
            },
            { name: '📍  Channel', value: `${message.channel}`, inline: true },
          );

        await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
      }
    }
  },
};
