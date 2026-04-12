'use strict';

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');
const { fetchRobloxProfileByUsername, createRobloxEmbed } = require('../../utils/roblox');

// ─── Command ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rblxsearch')
    .setDescription("Look up a server member's Roblox profile using their server nickname.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o
        .setName('user')
        .setDescription('The Discord member whose nickname will be searched on Roblox.')
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('override')
        .setDescription('Manually specify a Roblox username instead of using the nickname.'),
    ),

  async execute(interaction) {
    if (!hasModLevel(interaction.member, interaction.guild.id, MOD_LEVEL.moderator)) {
      return interaction.reply({
        embeds: [
          embeds.error(
            'You do not have the required permission level to use this command.',
            interaction.guild,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user');
    const override = interaction.options.getString('override');

    // Resolve the target member to get their nickname
    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    const nickname = override ?? member?.nickname ?? targetUser.username;

    if (!nickname) {
      return interaction.editReply({
        embeds: [
          embeds.error(
            'Could not determine a Roblox username. The user has no nickname set. Use the `override` option to specify one manually.',
            interaction.guild,
          ),
        ],
      });
    }

    try {
      const robloxData = await fetchRobloxProfileByUsername(nickname);
      if (!robloxData) {
        return interaction.editReply({
          embeds: [
            embeds.error(
              `No Roblox user found for **${nickname}**.\n\nIf the member uses a different Roblox username, use the \`override\` option.`,
              interaction.guild,
            ),
          ],
        });
      }

      const embed = createRobloxEmbed(interaction.guild, robloxData, nickname);
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('[rblxsearch] Error:', err);
      return interaction.editReply({
        embeds: [
          embeds.error(
            `An error occurred while fetching Roblox data: ${err.message}`,
            interaction.guild,
          ),
        ],
      });
    }
  },
};
