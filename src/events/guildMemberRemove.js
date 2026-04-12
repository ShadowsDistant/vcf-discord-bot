'use strict';

const { Events } = require('discord.js');
const analytics = require('../utils/analytics');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    analytics.recordMemberLeave(member.guild.id, Date.now());
  },
};
