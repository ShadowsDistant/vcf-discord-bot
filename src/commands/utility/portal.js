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

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return { emoji: '🟤', text: 'Good Morning' };
  if (hour >= 12 && hour < 17) return { emoji: '🟢', text: 'Good Afternoon' };
  if (hour >= 17 && hour < 22) return { emoji: '🔵', text: 'Good Evening' };
  return { emoji: '🟣', text: 'Good Night' };
}

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
    await interaction.guild.members.fetch().catch(() => null);

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
      .setTitle('  Department Portal');

    const description = 'Here is your department portal with handbook links and shift controls.';
    if (description && description.trim().length > 0) {
      embed.setDescription(description);
    }

    const greeting = getTimeGreeting();
    embed.addFields({
      name: `${greeting.emoji} ${greeting.text}, ${interaction.user.username}`,
      value: 'Here are your department details and handbook links.',
    });

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
