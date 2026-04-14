'use strict';

const { Events } = require('discord.js');
const analytics = require('../utils/analytics');
const embeds = require('../utils/embeds');
const { fetchLogChannel } = require('../utils/logChannels');
const economy = require('../utils/bakeEconomy');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    analytics.recordMemberLeave(member.guild.id, Date.now());
    economy.setUserBoosterStatus(member.guild.id, member.id, false);
    economy.setUserVcfTagStatus(member.guild.id, member.id, false);
    const channel = await fetchLogChannel(member.guild, 'leave');
    if (!channel) return;
    await channel.send({
      embeds: [
        embeds
          .base(member.guild)
          .setColor(0xed4245)
          .setTitle('Member Left')
          .setDescription(`${member.user} (\`${member.user.tag}\`) left the server.`)
          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
          .addFields({ name: 'User ID', value: `\`${member.user.id}\``, inline: true }),
      ],
    }).catch(() => null);
  },
};
