'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const https = require('https');
const embeds = require('../../utils/embeds');
const { hasModLevel, MOD_LEVEL } = require('../../utils/permissions');

// ─── Roblox API Helpers ───────────────────────────────────────────────────────

/**
 * Perform a GET request and resolve with the parsed JSON body.
 * @param {string} url
 * @returns {Promise<object>}
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'vcf-discord-bot/1.0' } }, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
          }
        });
      })
      .on('error', reject);
  });
}

/**
 * Search Roblox for a username and return the first exact (or closest) match.
 * Uses the Roblox Users search API.
 * @param {string} username
 * @returns {Promise<{ id: number, name: string, displayName: string }|null>}
 */
async function searchRobloxUser(username) {
  const url = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`;
  const data = await fetchJSON(url);
  if (!data.data?.length) return null;

  // Prefer an exact username match, fall back to first result
  const exact = data.data.find(
    (u) => u.name.toLowerCase() === username.toLowerCase(),
  );
  return exact ?? data.data[0];
}

/**
 * Get full Roblox user details by user ID.
 * @param {number} userId
 * @returns {Promise<object>}
 */
async function getRobloxUser(userId) {
  return fetchJSON(`https://users.roblox.com/v1/users/${userId}`);
}

/**
 * Get the headshot thumbnail URL for a Roblox user.
 * @param {number} userId
 * @returns {Promise<string|null>}
 */
async function getRobloxAvatar(userId) {
  const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`;
  const data = await fetchJSON(url);
  return data.data?.[0]?.imageUrl ?? null;
}

/**
 * Get Roblox friend count for a user.
 * @param {number} userId
 * @returns {Promise<number>}
 */
async function getRobloxFriendCount(userId) {
  const data = await fetchJSON(`https://friends.roblox.com/v1/users/${userId}/friends/count`);
  return data.count ?? 0;
}

/**
 * Get Roblox follower count for a user.
 * @param {number} userId
 * @returns {Promise<number>}
 */
async function getRobloxFollowerCount(userId) {
  const data = await fetchJSON(`https://friends.roblox.com/v1/users/${userId}/followers/count`);
  return data.count ?? 0;
}

// ─── Command ──────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rblxsearch')
    .setDescription("Look up a server member's Roblox profile using their server nickname.")
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
        ephemeral: true,
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
      // 1. Search for the user
      const searchResult = await searchRobloxUser(nickname);

      if (!searchResult) {
        return interaction.editReply({
          embeds: [
            embeds.error(
              `No Roblox user found for **${nickname}**.\n\nIf the member uses a different Roblox username, use the \`override\` option.`,
              interaction.guild,
            ),
          ],
        });
      }

      // 2. Fetch full profile, avatar, and social counts in parallel
      const [profile, avatarUrl, friendCount, followerCount] = await Promise.all([
        getRobloxUser(searchResult.id),
        getRobloxAvatar(searchResult.id).catch(() => null),
        getRobloxFriendCount(searchResult.id).catch(() => 0),
        getRobloxFollowerCount(searchResult.id).catch(() => 0),
      ]);

      const createdAt = profile.created
        ? `<t:${Math.floor(new Date(profile.created).getTime() / 1000)}:D>`
        : 'Unknown';

      const description = profile.description?.trim()
        ? profile.description.length > 300
          ? `${profile.description.slice(0, 297)}…`
          : profile.description
        : '_No description set._';

      const embed = embeds
        .base(interaction.guild)
        .setColor(0xe8373e) // Roblox red
        .setTitle(`  ${profile.displayName} (@${profile.name})`)
        .setURL(`https://www.roblox.com/users/${profile.id}/profile`)
        .setDescription(description)
        .addFields(
          { name: '🆔  User ID', value: `\`${profile.id}\``, inline: true },
          { name: '  Account Created', value: createdAt, inline: true },
          { name: '  Friends', value: `${friendCount.toLocaleString()}`, inline: true },
          {
            name: '  Followers',
            value: `${followerCount.toLocaleString()}`,
            inline: true,
          },
          {
            name: '  Banned',
            value: profile.isBanned ? ' Yes' : ' No',
            inline: true,
          },
          {
            name: '  Searched Nickname',
            value: `\`${nickname}\``,
            inline: true,
          },
          {
            name: '  Profile Link',
            value: `[View on Roblox](https://www.roblox.com/users/${profile.id}/profile)`,
            inline: false,
          },
        );

      if (avatarUrl) embed.setThumbnail(avatarUrl);

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
