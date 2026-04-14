'use strict';

const { Events } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../utils/database');
const analytics = require('../utils/analytics');
const { fetchLogChannel } = require('../utils/logChannels');
const economy = require('../utils/bakeEconomy');

const SERVER_BOOSTER_ROLE_ID = '1357082479931949310';

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    analytics.recordMemberJoin(member.guild.id, Date.now());
    economy.setUserBoosterStatus(member.guild.id, member.id, member.roles.cache.has(SERVER_BOOSTER_ROLE_ID));
    economy.setUserVcfTagStatus(member.guild.id, member.id, economy.inferVcfProfileTagStatus(member, member.user));
    const channel = await fetchLogChannel(member.guild, 'join');
    if (!channel) return;

    const config = db.getConfig(member.guild.id);
    const messageTemplate = config.welcomeMessage ?? 'Welcome to **{server}**, {user}! Please review the server rules.';

    const welcomeText = messageTemplate
      .replace('{user}', `${member}`)
      .replace('{server}', member.guild.name);

    const memberCount = member.guild.memberCount;
    const joinedTs = Math.floor((member.joinedTimestamp ?? Date.now()) / 1000);
    const createdTs = Math.floor(member.user.createdTimestamp / 1000);

    const embed = embeds
      .base(member.guild)
      .setColor(0x5865f2)
      .setTitle(`  Welcome to ${member.guild.name}!`)
      .setDescription(welcomeText)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '  Member', value: `${member} (\`${member.user.tag}\`)`, inline: true },
        { name: '  Member #', value: `\`#${memberCount.toLocaleString()}\``, inline: true },
        { name: '  Account Created', value: `<t:${createdTs}:R>`, inline: true },
        { name: '  Joined At', value: `<t:${joinedTs}:T>`, inline: true },
      );

    await channel.send({ embeds: [embed] }).catch(() => null);
  },
};
