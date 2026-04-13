'use strict';

const { Events } = require('discord.js');
const embeds = require('../utils/embeds');
const { fetchLogChannel } = require('../utils/logChannels');
const economy = require('../utils/bakeEconomy');

const SERVER_BOOSTER_ROLE_ID = '1357082479931949310';

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    if (!oldMember?.guild || !newMember?.guild) return;
    economy.setUserBoosterStatus(newMember.guild.id, newMember.id, newMember.roles.cache.has(SERVER_BOOSTER_ROLE_ID));
    const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
    const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
    if (addedRoles.size === 0 && removedRoles.size === 0) return;
    const channel = await fetchLogChannel(newMember.guild, 'role');
    if (!channel) return;
    const fields = [];
    if (addedRoles.size > 0) {
      fields.push({
        name: 'Roles Given',
        value: addedRoles.map((role) => `${role}`).join(', ').slice(0, 1024),
      });
    }
    if (removedRoles.size > 0) {
      fields.push({
        name: 'Roles Taken Away',
        value: removedRoles.map((role) => `${role}`).join(', ').slice(0, 1024),
      });
    }
    await channel.send({
      embeds: [
        embeds
          .base(newMember.guild)
          .setColor(0x5865f2)
          .setTitle('Member Roles Updated')
          .setDescription(`${newMember} (\`${newMember.user.tag}\`)`)
          .addFields(fields),
      ],
    }).catch(() => null);
  },
};
