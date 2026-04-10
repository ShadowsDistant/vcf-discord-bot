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
  hasShiftAccessRole,
  memberHasAnyRole,
  ALL_STAFF_ROLE_IDS,
} = require('../../utils/roles');
const db = require('../../utils/database');
const { formatDuration } = require('../../utils/helpers');

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return { emoji: '☀️', text: 'Good Morning' };
  if (hour >= 12 && hour < 17) return { emoji: '🌥️', text: 'Good Afternoon' };
  if (hour >= 17 && hour < 22) return { emoji: '⛅', text: 'Good Evening' };
  return { emoji: '🌙', text: 'Good Night' };
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

    if (!memberHasAnyRole(interaction.member, ALL_STAFF_ROLE_IDS)) {
      return interaction.reply({
        embeds: [
          embeds.error(
            'Only staff members can use the department portal.',
            interaction.guild,
          ),
        ],
        ephemeral: true,
      });
    }

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

    const description = interaction.guild?.description;
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
      const details = [
        department.description,
        `**Manager(s):** ${managerMentions}`,
      ];
      if (department.key !== 'osc') {
        details.push(`**Assistant Manager(s):** ${assistantMentions}`);
      }
      embed.addFields({
        name: department.title,
        value: details.join('\n'),
      });
    }

    const components = [];
    const resourceButtons = departments.map((department) =>
      new ButtonBuilder()
        .setLabel(`${department.title} Handbook`.slice(0, 80))
        .setStyle(ButtonStyle.Link)
        .setURL(department.handbook),
    );
    resourceButtons.push(
      new ButtonBuilder()
        .setLabel('Chain of Command')
        .setStyle(ButtonStyle.Link)
        .setURL('https://docs.valleycorrectional.xyz/internal-documents/chain-of-command'),
    );

    if (resourceButtons.length) {
      components.push(new ActionRowBuilder().addComponents(resourceButtons.slice(0, 5)));
    }

    if (hasShiftAccessRole(interaction.member)) {
      const history = db.getUserShiftHistory(interaction.guild.id, interaction.user.id);
      const totalMs = history.reduce((sum, shift) => sum + shift.durationMs, 0);
      const active = db.getActiveShift(interaction.guild.id, interaction.user.id);
      const startedTs = active
        ? Math.floor(new Date(active.startedAt).getTime() / 1000)
        : null;

      embed.addFields({
        name: '⏱️ Quick Shift Overview',
        value: [
          `Status: **${active ? 'On Shift' : 'Off Shift'}**`,
          active ? `Started: <t:${startedTs}:R>` : 'Started: N/A',
          `Completed Shifts: **${history.length}**`,
          `Total Shift Time: **${formatDuration(totalMs)}**`,
        ].join('\n'),
      });

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
          new ButtonBuilder()
            .setCustomId('portal_shiftdetails')
            .setLabel('View Shift Details')
            .setStyle(ButtonStyle.Secondary),
        ),
      );
    }

    return interaction.reply({ embeds: [embed], components, ephemeral: true });
  },
};
