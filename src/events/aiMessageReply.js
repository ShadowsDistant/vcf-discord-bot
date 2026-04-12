'use strict';

const { Events } = require('discord.js');
const aiCommand = require('../commands/dev/ai');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.reference?.messageId) return;
    await aiCommand.handleAiReplyMessage(message);
  },
};
