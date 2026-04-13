'use strict';

const { EmbedBuilder } = require('discord.js');
const { fetchLogChannel } = require('./logChannels');

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
 * Sends a moderation action log to the central mod-log channel.
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
  const channel = await fetchLogChannel(guild, 'modLog');
  if (!channel) return;

  const colorByAction = { Warn: 0xfee75c, Kick: 0xff6b35, Ban: 0xed4245 };
  const emojiByAction = { Warn: '⚠️', Kick: '👟', Ban: '🔨' };

  const embed = new EmbedBuilder()
    .setColor(colorByAction[action] ?? 0xed4245)
    .setTitle(`${emojiByAction[action] ?? '🛡️'} Member ${action}ned`)
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
  sendReporterStatusDm,
};
