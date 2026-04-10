'use strict';

const {
  MODERATION_ROLE_IDS,
  SID_ROLE_IDS,
  MANAGEMENT_ROLE_IDS,
  ROLE_IDS,
} = require('./roles');

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
  if (requiredLevel <= MOD_LEVEL.moderator) {
    return [...MODERATION_ROLE_IDS].some((id) => member.roles.cache.has(id));
  }
  if (requiredLevel <= MOD_LEVEL.seniorMod) {
    return (
      member.roles.cache.has(ROLE_IDS.moderation.moderator)
      || member.roles.cache.has(ROLE_IDS.moderation.seniorModerator)
    );
  }
  return [...MANAGEMENT_ROLE_IDS].some((id) => member.roles.cache.has(id));
}

/**
 * Check whether member has the configured SID role.
 * @param {import('discord.js').GuildMember} member
 * @param {string} _guildId
 * @returns {boolean}
 */
function hasSidRole(member, _guildId) {
  return [...SID_ROLE_IDS].some((id) => member.roles.cache.has(id));
}

module.exports = { hasModLevel, hasSidRole, MOD_LEVEL };
