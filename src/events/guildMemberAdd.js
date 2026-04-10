'use strict';

const { Events } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../utils/database');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const config = db.getConfig(member.guild.id);
    if (!config.welcomeChannelId) return;

    const channel = member.guild.channels.cache.get(config.welcomeChannelId);
    if (!channel) return;

    const messageTemplate =
      config.welcomeMessage ??
      'Welcome to **{server}**, {user}! We hope you enjoy your stay. 🎉';

    const welcomeText = messageTemplate
      .replace('{user}', `${member}`)
      .replace('{server}', member.guild.name);

    const memberCount = member.guild.memberCount;
    const joinedTs = Math.floor((member.joinedTimestamp ?? Date.now()) / 1000);
    const createdTs = Math.floor(member.user.createdTimestamp / 1000);

    const embed = embeds
      .base(member.guild)
      .setColor(0x5865f2)
      .setTitle(`👋  Welcome to ${member.guild.name}!`)
      .setDescription(welcomeText)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👤  Member', value: `${member} (\`${member.user.tag}\`)`, inline: true },
        { name: '🔢  Member #', value: `\`#${memberCount.toLocaleString()}\``, inline: true },
        { name: '📅  Account Created', value: `<t:${createdTs}:R>`, inline: true },
        { name: '📥  Joined At', value: `<t:${joinedTs}:T>`, inline: true },
      );

    await channel.send({ embeds: [embed] }).catch(() => null);
  },
};
