'use strict';

const db = require('./database');

const COMMAND_RESTRICTIONS_FILE = 'command_restrictions.json';

function normalizeUserId(userId) {
  return String(userId ?? '').trim();
}

function normalizeCommandName(commandName) {
  return String(commandName ?? '').trim().toLowerCase();
}

function normalizeReason(reason) {
  return String(reason ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}

function getUserRestrictions(userId) {
  const targetUserId = normalizeUserId(userId);
  if (!targetUserId) return {};
  const data = db.read(COMMAND_RESTRICTIONS_FILE, {});
  const restrictions = data?.[targetUserId];
  if (!restrictions || typeof restrictions !== 'object') return {};
  const normalized = {};
  for (const [commandName, reason] of Object.entries(restrictions)) {
    const safeCommand = normalizeCommandName(commandName);
    const safeReason = normalizeReason(reason);
    if (!safeCommand || !safeReason) continue;
    normalized[safeCommand] = safeReason;
  }
  return normalized;
}

function listUserRestrictions(userId) {
  const restrictions = getUserRestrictions(userId);
  return Object.entries(restrictions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([commandName, reason]) => ({ commandName, reason }));
}

function getRestrictionReason(userId, commandName) {
  const targetUserId = normalizeUserId(userId);
  const safeCommandName = normalizeCommandName(commandName);
  if (!targetUserId || !safeCommandName) return null;
  const restrictions = getUserRestrictions(targetUserId);
  return restrictions[safeCommandName] ?? null;
}

function setRestriction(userId, commandName, reason) {
  const targetUserId = normalizeUserId(userId);
  const safeCommandName = normalizeCommandName(commandName);
  const safeReason = normalizeReason(reason);
  if (!targetUserId) return { ok: false, reason: 'Target user ID is required.' };
  if (!safeCommandName) return { ok: false, reason: 'Command name is required.' };
  if (!safeReason) return { ok: false, reason: 'Restriction reason is required.' };

  return db.update(COMMAND_RESTRICTIONS_FILE, {}, (data) => {
    if (!data[targetUserId] || typeof data[targetUserId] !== 'object') data[targetUserId] = {};
    data[targetUserId][safeCommandName] = safeReason;
    return { ok: true, userId: targetUserId, commandName: safeCommandName, reason: safeReason };
  });
}

function removeRestriction(userId, commandName) {
  const targetUserId = normalizeUserId(userId);
  const safeCommandName = normalizeCommandName(commandName);
  if (!targetUserId) return { ok: false, reason: 'Target user ID is required.' };
  if (!safeCommandName) return { ok: false, reason: 'Command name is required.' };

  return db.update(COMMAND_RESTRICTIONS_FILE, {}, (data) => {
    const restrictions = data?.[targetUserId];
    if (!restrictions || typeof restrictions !== 'object' || !restrictions[safeCommandName]) {
      return { ok: false, reason: 'No restriction found for that user and command.' };
    }
    delete restrictions[safeCommandName];
    if (Object.keys(restrictions).length === 0) delete data[targetUserId];
    return { ok: true, userId: targetUserId, commandName: safeCommandName };
  });
}

function isCommandRestricted(userId, commandName) {
  return Boolean(getRestrictionReason(userId, commandName));
}

module.exports = {
  listUserRestrictions,
  getRestrictionReason,
  setRestriction,
  removeRestriction,
  isCommandRestricted,
};
