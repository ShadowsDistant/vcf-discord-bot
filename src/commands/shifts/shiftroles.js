'use strict';

const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../../utils/embeds');
const { ROLE_IDS } = require('../../utils/roles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shiftroles')
    .setDescription('View the role currently allowed to start shifts.')
    .setDMPermission(false),

  async execute(interaction) {
    return interaction.reply({
      embeds: [
        embeds
          .shift('  Shift Roles', 'This role is currently allowed to start shifts:', interaction.guild)
          .addFields({
            name: 'Role',
            value: `<@&${ROLE_IDS.moderationAccess}> (\`${ROLE_IDS.moderationAccess}\`)`,
            inline: true,
          }),
      ],
    });
  },
};
