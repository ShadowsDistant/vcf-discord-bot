'use strict';

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const {
  getMemberDepartments,
  hasModerationAccessRole,
} = require('../../utils/roles');

function mentionsForRole(guild, roleId) {
  const role = guild.roles.cache.get(roleId);
  if (!role) return 'Not found';
  const members = [...role.members.values()].slice(0, 10).map((m) => `<@${m.id}>`);
  if (!members.length) return 'None assigned';
  const extra = role.members.size > 10 ? ` (+${role.members.size - 10} more)` : '';
  return `${members.join(', ')}${extra}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('portal')
    .setDescription('View your department portal, handbook links, and shift controls.'),

  async execute(interaction) {
    const departments = getMemberDepartments(interaction.member);
    if (!departments.length) {
      return interaction.reply({
        embeds: [
          embeds.info(
            '  Department Portal',
            'You are not currently in a tracked department.',
            interaction.guild,
          ),
        ],
        ephemeral: true,
      });
    }

    const embed = embeds
      .base(interaction.guild)
      .setTitle('  Department Portal')
      .setDescription(
        `Hello ${interaction.user}, here are your department details and handbooks.`,
      );

    for (const department of departments) {
      const managerMentions = mentionsForRole(interaction.guild, department.managerRoleId);
      const assistantMentions = mentionsForRole(interaction.guild, department.assistantManagerRoleId);
      embed.addFields({
        name: department.title,
        value: [
          department.description,
          `**Manager(s):** ${managerMentions}`,
          `**Assistant Manager(s):** ${assistantMentions}`,
          `**Handbook:** ${department.handbook}`,
        ].join('\n'),
      });
    }

    const components = [];
    if (hasModerationAccessRole(interaction.member)) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('portal_startshift')
            .setLabel('Start Shift')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('portal_endshift')
            .setLabel('End Shift')
            .setStyle(ButtonStyle.Danger),
        ),
      );
    }

    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },
};
