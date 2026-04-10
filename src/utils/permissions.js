'use strict';

const {
  MODERATION_ROLE_IDS,
  SID_ROLE_IDS,
  ROLE_IDS,
} = require('./roles');
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

/**
 * Check whether a guild member meets the required moderation level.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {string} _guildId
 * @param {number} requiredLevel  1 | 2 | 3
 * @returns {boolean}
 */
function hasModLevel(member, _guildId, requiredLevel) {
  const hasLeadOverseerRole = member.roles.cache.has(ROLE_IDS.leadOverseer);
  const hasNonLeadManagementRole = [...ROLE_IDS.helpManagementAccess]
    .filter((id) => id !== ROLE_IDS.leadOverseer)
    .some((id) => member.roles.cache.has(id));
  const managementPermissionMode = db.getConfig(_guildId).oversightManagementPermissionMode === 'MODERATOR'
    ? 'MODERATOR'
    : 'ALL';
  const hasManagementAllAccess = hasLeadOverseerRole
    || (managementPermissionMode === 'ALL' && hasNonLeadManagementRole);
  const hasManagementModeratorAccess = managementPermissionMode === 'MODERATOR' && hasNonLeadManagementRole;

  if (requiredLevel <= MOD_LEVEL.moderator) {
    return (
      hasManagementAllAccess
      || hasManagementModeratorAccess
      || [...MODERATION_ROLE_IDS].some((id) => member.roles.cache.has(id))
    );
  }
  if (requiredLevel <= MOD_LEVEL.seniorMod) {
    return (
      hasManagementAllAccess
      || member.roles.cache.has(ROLE_IDS.moderation.seniorModerator)
    );
  }
  return hasManagementAllAccess;
}

/**
 * Check whether member has any SID role.
 * @param {import('discord.js').GuildMember} member
 * @param {string} _guildId
 * @returns {boolean}
 */
function hasSidRole(member, _guildId) {
  return [...SID_ROLE_IDS].some((id) => member.roles.cache.has(id));
}

module.exports = { hasModLevel, hasSidRole, MOD_LEVEL };
