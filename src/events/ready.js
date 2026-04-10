'use strict';

const { Events, ActivityType } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`  Serving ${client.guilds.cache.size} guild(s) | ${client.users.cache.size} cached users`);

    client.user.setPresence({
      activities: [
        {
          name: '/help',
          type: ActivityType.Listening,
        },
      ],
      status: 'online',
    });
  },
};
