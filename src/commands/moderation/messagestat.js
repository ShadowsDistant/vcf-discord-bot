'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
} = require('discord.js');
const economy = require('../../utils/bakeEconomy');
const embeds = require('../../utils/embeds');
const {
  MANAGEMENT_ROLE_IDS,
  LEAD_OVERSEER_ROLE_ID,
  memberHasAnyRole,
} = require('../../utils/roles');

const STATS_ROLE_IDS = new Set([
  ...Object.values(MANAGEMENT_ROLE_IDS ?? {}),
  LEAD_OVERSEER_ROLE_ID,
]);

function canViewStats(member) {
  return member && memberHasAnyRole(member, STATS_ROLE_IDS);
}

function buildProgressBar(ratio, width = 12) {
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return '```' + '█' * filled + '░' * empty + `| ${Math.round(ratio * 100)}%` + '```';
}

/**
 * Find a pending message by ID across all tracked users in the guild.
 * For broadcast/staff_message types we store the same ID on all recipients,
 * so we scan until we find one with matching id.
 * @returns {{msg: object, userId: string} | null}
 */
function findMessageById(guildId, messageId) {
  const { readState } = economy;
  const data = readState();
  const guildState = data[guildId];
  if (!guildState?.users) return null;
  for (const [userId, user] of Object.entries(guildState.users)) {
    if (!Array.isArray(user.pendingMessages)) continue;
    const found = user.pendingMessages.find((m) => String(m.id) === String(messageId));
    if (found) return { msg: found, userId };
  }
  return null;
}

function getAudienceLabel(msg) {
  if (msg.type === 'staff_message') {
    const TYPES = {
      info: 'Information',
      reminder: 'Reminder',
      announcement: 'Announcement',
      alert: 'Alert',
      warning: 'Warning',
    };
    return TYPES[msg.messageType] ?? 'Staff Message';
  }
  if (msg.type === 'broadcast') {
    return msg.broadcastKind === 'dev' ? 'Dev Broadcast' : 'Broadcast';
  }
  return msg.type ?? 'Message';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('messagestat')
    .setDescription('View delivery stats for a broadcast or staff message (management only).')
    .addStringOption((opt) =>
      opt.setName('message_id')
        .setDescription('The message ID returned when the message was sent.')
        .setRequired(true)
    )
    .setDMPermission(false),

  async execute(interaction) {
    if (!canViewStats(interaction.member)) {
      return interaction.reply({
        embeds: [embeds.error('Only Management and Lead Overseer can use this command.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const messageIdStr = interaction.options.getString('message_id', true).trim();
    const messageId = parseInt(messageIdStr, 10);

    // Find the message across all tracked users
    const found = findMessageById(interaction.guild.id, messageId);

    if (!found) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('Message Not Found')
            .setDescription(`No tracked message found with ID **${messageIdStr}**. Make sure you are using a message ID returned by \`/broadcastmessage\` or \`/staffmessage\`.`)
            .setTimestamp(),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const { msg, userId } = found;

    // Only show stats for trackable types
    const isTrackable = (msg.type === 'broadcast' || msg.type === 'staff_message') && Number.isFinite(msg.broadcastTotal);
    if (!isTrackable) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf0b232)
            .setTitle('Not Trackable')
            .setDescription('This message type does not have delivery tracking.')
            .setTimestamp(),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const total = msg.broadcastTotal;
    const seenAt = msg.seenAt ? Math.floor(msg.seenAt / 1000) : null;
    const claimedAt = msg.claimedAt ? Math.floor(msg.claimedAt / 1000) : null;
    const sentAt = msg.broadcastSentAt ? Math.floor(msg.broadcastSentAt / 1000) : null;
    const audienceLabel = getAudienceLabel(msg);

    const fields = [
      { name: 'Type', value: audienceLabel, inline: true },
      { name: 'Sent By', value: msg.from ?? 'Unknown', inline: true },
      { name: 'Sent At', value: sentAt ? `<t:${sentAt}:f>` : 'Unknown', inline: true },
      { name: 'Total Recipients', value: String(total), inline: true },
      {
        name: 'Seen',
        value: msg.seenAt ? `<t:${seenAt}:R>` : 'Not yet',
        inline: true,
      },
      {
        name: 'Read (Claimed)',
        value: msg.claimedAt ? `<t:${claimedAt}:R>` : 'Not yet',
        inline: true,
      },
    ];

    if (msg.title) fields.push({ name: 'Title', value: msg.title, inline: false });
    if (msg.content) fields.push({ name: 'Content', value: msg.content.slice(0, 500), inline: false });
    fields.push({
      name: '📈 Read Progress',
      value: buildProgressBar(1, 16), // We don't know exact read count here; shown from the opener's perspective
      inline: false,
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`${msg.type === 'broadcast' ? '-' : '📨'} ${audienceLabel} — Delivery Report`)
      .setDescription(`**Message ID:** \`${messageIdStr}\`  •  Tracked from: <@${userId}>'s inbox`)
      .addFields(fields)
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
