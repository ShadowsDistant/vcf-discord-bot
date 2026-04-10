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
    const managementRoleIds = [...ROLE_IDS.helpManagementAccess].filter((id) => id !== ROLE_IDS.leadOverseer);
    const accessRoleLines = [
      `<@&${ROLE_IDS.moderationAccess}> (\`${ROLE_IDS.moderationAccess}\`)`,
      ...managementRoleIds.map((id) => `<@&${id}> (\`${id}\`)`),
      `<@&${ROLE_IDS.leadOverseer}> (\`${ROLE_IDS.leadOverseer}\`)`,
    ];

    return interaction.reply({
      embeds: [
        embeds
          .shift('  Shift Roles', 'These roles are currently allowed to use shift commands:', interaction.guild)
          .addFields({
            name: 'Shift Access',
            value: accessRoleLines.join('\n'),
            inline: true,
          }),
      ],
    });
  },
};
