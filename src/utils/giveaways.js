'use strict';

const { EmbedBuilder } = require('discord.js');
const db = require('./database');

const GIVEAWAY_FILE = 'giveaways.json';
const GIVEAWAY_REACTION = '🎉';

function getGuildStore(data, guildId) {
  if (!data[guildId]) data[guildId] = { records: [] };
  if (!Array.isArray(data[guildId].records)) data[guildId].records = [];
  return data[guildId];
}

function parseDurationMs(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return null;
  const parts = [...raw.matchAll(/(\d+)\s*([smhd])/g)];
  if (!parts.length) return null;
  let total = 0;
  for (const [, amountRaw, unit] of parts) {
    const amount = Number.parseInt(amountRaw, 10);
    if (!Number.isInteger(amount) || amount <= 0) return null;
    if (unit === 's') total += amount * 1000;
    if (unit === 'm') total += amount * 60_000;
    if (unit === 'h') total += amount * 60 * 60_000;
    if (unit === 'd') total += amount * 24 * 60 * 60_000;
  }
  if (total <= 0) return null;
  return total;
}

function createGiveawayRecord(guildId, channelId, messageId, hostId, prize, winnerCount, endAt) {
  const now = Date.now();
  return db.update(GIVEAWAY_FILE, {}, (data) => {
    const guildStore = getGuildStore(data, guildId);
    const record = {
      id: `${now}:${messageId}`,
      guildId,
      channelId,
      messageId,
      hostId,
      prize,
      winnerCount: Math.max(1, Number.parseInt(winnerCount, 10) || 1),
      createdAt: now,
      endAt: Number(endAt),
      endedAt: null,
      status: 'active',
      winnerIds: [],
      rerollCount: 0,
    };
    guildStore.records.push(record);
    return record;
  });
}

function listDueActiveGiveaways(now = Date.now()) {
  const data = db.read(GIVEAWAY_FILE, {});
  const due = [];
  for (const [guildId, guildStore] of Object.entries(data)) {
    for (const record of guildStore?.records ?? []) {
      if (record?.status !== 'active') continue;
      if (!Number.isFinite(Number(record.endAt))) continue;
      if (Number(record.endAt) > now) continue;
      due.push({ guildId, record });
    }
  }
  due.sort((a, b) => Number(a.record.createdAt ?? 0) - Number(b.record.createdAt ?? 0));
  return due;
}

function getOldestActiveGiveaway(guildId, channelId) {
  const data = db.read(GIVEAWAY_FILE, {});
  const guildStore = data?.[guildId];
  const records = (guildStore?.records ?? [])
    .filter((record) => record?.status === 'active' && String(record.channelId) === String(channelId))
    .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0));
  return records[0] ?? null;
}

function getOldestEndedGiveawayForReroll(guildId, channelId) {
  const data = db.read(GIVEAWAY_FILE, {});
  const guildStore = data?.[guildId];
  const records = (guildStore?.records ?? [])
    .filter((record) => record?.status === 'ended' && String(record.channelId) === String(channelId))
    .sort((a, b) => {
      const rerollCmp = Number(a.rerollCount ?? 0) - Number(b.rerollCount ?? 0);
      if (rerollCmp !== 0) return rerollCmp;
      return Number(a.endedAt ?? 0) - Number(b.endedAt ?? 0);
    });
  return records[0] ?? null;
}

function markGiveawayEnded(guildId, messageId, winnerIds) {
  return db.update(GIVEAWAY_FILE, {}, (data) => {
    const guildStore = getGuildStore(data, guildId);
    const record = guildStore.records.find((entry) => String(entry.messageId) === String(messageId));
    if (!record) return null;
    record.status = 'ended';
    record.endedAt = Date.now();
    record.winnerIds = [...winnerIds];
    return record;
  });
}

function markGiveawayRerolled(guildId, messageId, winnerIds) {
  return db.update(GIVEAWAY_FILE, {}, (data) => {
    const guildStore = getGuildStore(data, guildId);
    const record = guildStore.records.find((entry) => String(entry.messageId) === String(messageId));
    if (!record) return null;
    record.winnerIds = [...winnerIds];
    record.rerollCount = Number(record.rerollCount ?? 0) + 1;
    record.lastRerolledAt = Date.now();
    return record;
  });
}

function pickWinners(participantIds, winnerCount) {
  const pool = [...new Set(participantIds)];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(1, winnerCount));
}

async function collectGiveawayParticipants(message) {
  const reaction = message.reactions.cache.get(GIVEAWAY_REACTION) ?? await message.reactions.fetch(GIVEAWAY_REACTION).catch(() => null);
  if (!reaction) return [];
  const users = await reaction.users.fetch().catch(() => null);
  if (!users) return [];
  return [...users.values()].filter((user) => !user.bot).map((user) => user.id);
}

function buildEndedEmbed(record, winnerMentions, endedByLabel) {
  return new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('🎉 Giveaway Ended')
    .setDescription(`**Prize:** ${record.prize}`)
    .addFields(
      { name: 'Hosted By', value: `<@${record.hostId}>`, inline: true },
      { name: 'Winners', value: winnerMentions || 'No valid entries.', inline: false },
      { name: 'Ended By', value: endedByLabel, inline: true },
    )
    .setTimestamp();
}

async function concludeGiveawayRecord(guild, record, endedByLabel = 'Automatic Timer') {
  const channel = await guild.channels.fetch(record.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return { ok: false, reason: 'Giveaway channel no longer exists.' };
  const message = await channel.messages.fetch(record.messageId).catch(() => null);
  if (!message) return { ok: false, reason: 'Giveaway message no longer exists.' };
  const participantIds = await collectGiveawayParticipants(message);
  const winnerIds = pickWinners(participantIds, record.winnerCount);
  const winnerMentions = winnerIds.length ? winnerIds.map((id) => `<@${id}>`).join(', ') : 'No valid entries.';
  const endedEmbed = buildEndedEmbed(record, winnerMentions, endedByLabel);
  await message.edit({ embeds: [endedEmbed] }).catch(() => null);
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('🎊 Giveaway Result')
        .setDescription(`Prize: **${record.prize}**\nWinners: ${winnerMentions}`),
    ],
  }).catch(() => null);
  markGiveawayEnded(guild.id, record.messageId, winnerIds);
  return { ok: true, winners: winnerIds, winnerMentions, messageUrl: message.url };
}

module.exports = {
  GIVEAWAY_REACTION,
  parseDurationMs,
  createGiveawayRecord,
  listDueActiveGiveaways,
  getOldestActiveGiveaway,
  getOldestEndedGiveawayForReroll,
  markGiveawayEnded,
  markGiveawayRerolled,
  pickWinners,
  collectGiveawayParticipants,
  buildEndedEmbed,
  concludeGiveawayRecord,
};
