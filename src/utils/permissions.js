'use strict';

const db = require('./database');

/**
 * Moderation permission levels.
 *  1 = Moderator     (warn, kick, timeout, lock/unlock, slowmode, purge)
 *  2 = Senior Mod    (ban, unban + all level-1)
 *  3 = Leadership    (all commands, wave management)
 */
const MOD_LEVEL = {
  moderator: 1,
  seniorMod: 2,
  management: 3,
};

/** Config key for each level. */
const ROLE_KEY = {
  1: 'moderatorRoleId',
  2: 'seniorModRoleId',
  3: 'managementRoleId',
};

/**
 * Check whether a guild member meets the required moderation level.
 *
 * Logic:
 *  - If no mod roles are configured at all → returns true (fall through to Discord perms).
 *  - If any mod roles are configured → the member must have a role at or above
 *    the required level.  Higher-level roles always satisfy lower-level checks.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {string} guildId
 * @param {number} requiredLevel  1 | 2 | 3
 * @returns {boolean}
 */
function hasModLevel(member, guildId, requiredLevel) {
  const config = db.getConfig(guildId);

  // Determine whether any mod roles have been configured at all
  const anyConfigured = Object.values(ROLE_KEY).some((key) => config[key]);
  if (!anyConfigured) return true; // No role system configured – defer to Discord perms

  // Check from highest level down to requiredLevel (higher roles satisfy lower checks)
  for (let level = 3; level >= requiredLevel; level--) {
    const roleId = config[ROLE_KEY[level]];
    if (roleId && member.roles.cache.has(roleId)) return true;
  }

  return false;
}

/**
 * Check whether member has the configured SID role.
 * @param {import('discord.js').GuildMember} member
 * @param {string} guildId
 * @returns {boolean}
 */
function hasSidRole(member, guildId) {
  const config = db.getConfig(guildId);
  const sidRoleId = config.sidRoleId;
  return Boolean(sidRoleId && member.roles.cache.has(sidRoleId));
}

module.exports = { hasModLevel, hasSidRole, MOD_LEVEL };
