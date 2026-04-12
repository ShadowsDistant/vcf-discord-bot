'use strict';

const { Events } = require('discord.js');
const embeds = require('../utils/embeds');
const { fetchLogChannel } = require('../utils/logChannels');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    const channel = await fetchLogChannel(message.guild, 'chatDelete');
    if (!channel) return;
    const content = (message.content?.trim() || '(no text content)').slice(0, 1024);
    const author = message.author;
    await channel.send({
      embeds: [
        embeds
          .base(message.guild)
          .setColor(0xed4245)
          .setTitle('Message Deleted')
          .addFields(
            { name: 'Author', value: author ? `${author} (\`${author.tag}\`)` : 'Unknown', inline: true },
            { name: 'Channel', value: `${message.channel}`, inline: true },
            { name: 'Message ID', value: `\`${message.id}\``, inline: true },
            { name: 'Content', value: content, inline: false },
          ),
      ],
    }).catch(() => null);
  },
};
