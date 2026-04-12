'use strict';

const { Events } = require('discord.js');
const embeds = require('../utils/embeds');
const { fetchLogChannel } = require('../utils/logChannels');

module.exports = {
  name: Events.GuildRoleDelete,
  async execute(role) {
    const channel = await fetchLogChannel(role.guild, 'role');
    if (!channel) return;
    await channel.send({
      embeds: [
        embeds
          .base(role.guild)
          .setColor(0xed4245)
          .setTitle('Role Deleted')
          .addFields(
            { name: 'Role Name', value: `\`${role.name}\``, inline: true },
            { name: 'Role ID', value: `\`${role.id}\``, inline: true },
          ),
      ],
    }).catch(() => null);
  },
};
