'use strict';

const { EmbedBuilder } = require('discord.js');

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
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    });
  }

  const sent = await user.send({ embeds: [embed] }).catch(() => null);
  return Boolean(sent);
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
  sendReporterStatusDm,
};
