'use strict';

const { EmbedBuilder } = require('discord.js');
const { fetchLogChannel } = require('./logChannels');

const RECENT_LOG_KEYS = new Map();
const LOG_DEDUPE_WINDOW_MS = 4_000;

function shouldSkipDuplicateLog(keyBase) {
  const now = Date.now();
  for (const [key, ts] of RECENT_LOG_KEYS.entries()) {
    if (now - ts > LOG_DEDUPE_WINDOW_MS) RECENT_LOG_KEYS.delete(key);
  }
  const key = String(keyBase ?? '');
  const prev = RECENT_LOG_KEYS.get(key);
  if (prev && now - prev <= LOG_DEDUPE_WINDOW_MS) return true;
  RECENT_LOG_KEYS.set(key, now);
  return false;
}

async function sendModerationActionDm({
  user,
  guild,
  action,
  reason,
  moderatorTag,
  duration,
}) {
  if (!user) return false;
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(`Moderation Notice — ${action}`)
    .setDescription(`You received a **${action.toLowerCase()}** in **${guild?.name ?? 'this server'}**.`)
    .addFields(
      { name: 'Reason', value: reason || 'No reason provided.' },
      { name: 'Staff Member', value: moderatorTag || 'Unknown' },
    )
    .setTimestamp();

  if (duration) {
    embed.addFields({ name: 'Duration', value: duration, inline: true });
  }

  if (guild) {
    embed.setFooter({
      text: guild.name,
      iconURL: guild.iconURL() ?? undefined,
    });
  }

  const sent = await user.send({ embeds: [embed] }).catch(() => null);
  return Boolean(sent);
}

/**
 * Sends a punishment log to the dedicated punishment log channel.
 * @param {Object} opts
 * @param {import('discord.js').Guild} opts.guild
 * @param {import('discord.js').User} opts.target
 * @param {import('discord.js').User} opts.moderator
 * @param {string} opts.action  e.g. 'Warn', 'Kick', 'Ban'
 * @param {string} opts.reason
 * @param {string} [opts.extra]  optional extra field value (e.g. total warnings)
 * @returns {Promise<void>}
 */
async function sendModLog({ guild, target, moderator, action, reason, extra } = {}) {
  if (!guild) return;
  const dedupeKey = `mod:${guild.id}:${action}:${target?.id ?? 'unknown'}:${moderator?.id ?? 'unknown'}:${String(reason ?? '').slice(0, 120)}`;
  if (shouldSkipDuplicateLog(dedupeKey)) return;
  const channel = await fetchLogChannel(guild, 'punishmentLog');
  if (!channel) return;

  const colorByAction = { Warn: 0xfee75c, Kick: 0xff6b35, Ban: 0xed4245, Timeout: 0x5865f2, Mute: 0xf57c00, Deafen: 0x9b59b6, Unmute: 0x57f287, Undeafen: 0x57f287 };
  const emojiByAction = { Warn: '⚠️', Kick: '👟', Ban: '🔨', Timeout: '⏳', Mute: '🔇', Deafen: '🔕', Unmute: '🔊', Undeafen: '🔔' };
  const titleByAction = {
    Warn: 'Member Warned',
    Kick: 'Member Kicked',
    Ban: 'Member Banned',
    Timeout: 'Member Timed Out',
    Mute: 'Member Server-Muted',
    Deafen: 'Member Server-Deafened',
    Unmute: 'Member Server-Unmuted',
    Undeafen: 'Member Server-Undeafened',
  };

  const embed = new EmbedBuilder()
    .setColor(colorByAction[action] ?? 0xed4245)
    .setTitle(`${emojiByAction[action] ?? '🛡️'} ${titleByAction[action] ?? `Member ${action}`}`)
    .setThumbnail(target?.displayAvatarURL({ dynamic: true }) ?? null)
    .addFields(
      { name: 'Member', value: `${target} (\`${target?.tag}\`)`, inline: true },
      { name: 'Moderator', value: `${moderator} (\`${moderator?.tag}\`)`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided.' },
    )
    .setTimestamp()
    .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined });

  if (extra) {
    embed.addFields({ name: 'Additional Info', value: extra, inline: true });
  }

  await channel.send({ embeds: [embed] }).catch(() => null);
}

/**
 * Sends a general moderation/management command execution log.
 * @param {Object} opts
 * @param {import('discord.js').Guild} opts.guild
 * @param {import('discord.js').User} opts.moderator
 * @param {string} opts.action  e.g. 'Purge', 'Lock', 'Slowmode'
 * @param {string} [opts.target]  Optional target description string
 * @param {string} [opts.details]  Optional details about the action
 * @returns {Promise<void>}
 */
async function sendCommandLog({ guild, moderator, action, target, details } = {}) {
  if (!guild) return;
  const dedupeKey = `cmd:${guild.id}:${action}:${moderator?.id ?? 'unknown'}:${String(target ?? '').slice(0, 80)}:${String(details ?? '').slice(0, 120)}`;
  if (shouldSkipDuplicateLog(dedupeKey)) return;
  const channel = await fetchLogChannel(guild, 'commandLog');
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🔧 ${action}`)
    .addFields(
      { name: 'Moderator', value: `${moderator} (\`${moderator?.tag}\`)`, inline: true },
    )
    .setTimestamp()
    .setFooter({ text: guild.name, iconURL: guild.iconURL() ?? undefined });

  if (target) embed.addFields({ name: 'Target', value: String(target).slice(0, 1024), inline: true });
  if (details) embed.addFields({ name: 'Details', value: String(details).slice(0, 1024), inline: false });

  await channel.send({ embeds: [embed] }).catch(() => null);
}

async function sendReporterStatusDm({ user, guild, status, reportReason }) {
  if (!user) return false;
  const embed = new EmbedBuilder()
    .setColor(status === 'dismissed' ? 0xfee75c : 0x57f287)
    .setTitle('Message Report Update')
    .setDescription(
      status === 'submitted'
        ? `Your report in **${guild?.name ?? 'this server'}** has been sent to moderators.`
        : status === 'dismissed'
          ? `Your report in **${guild?.name ?? 'this server'}** was reviewed and dismissed.`
          : `Your report in **${guild?.name ?? 'this server'}** was reviewed and action was taken.`,
    )
    .setTimestamp();

  if (reportReason && status === 'dismissed') {
    embed.addFields({ name: 'Dismissal Reason', value: reportReason.slice(0, 1024) });
  }

  const sent = await user.send({ embeds: [embed] }).catch(() => null);
  return Boolean(sent);
}

module.exports = {
  sendModerationActionDm,
  sendModLog,
  sendCommandLog,
  sendReporterStatusDm,
};
