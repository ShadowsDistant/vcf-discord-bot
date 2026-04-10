'use strict';

const https = require('https');
const embeds = require('./embeds');

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

async function searchRobloxUser(username) {
  const url = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`;
  const data = await fetchJSON(url);
  if (!data.data?.length) return null;
  const exact = data.data.find((u) => u.name.toLowerCase() === username.toLowerCase());
  return exact ?? data.data[0];
}

async function getRobloxUser(userId) {
  return fetchJSON(`https://users.roblox.com/v1/users/${userId}`);
}

async function getRobloxAvatar(userId) {
  const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`;
  const data = await fetchJSON(url);
  return data.data?.[0]?.imageUrl ?? null;
}

async function getRobloxFriendCount(userId) {
  const data = await fetchJSON(`https://friends.roblox.com/v1/users/${userId}/friends/count`);
  return data.count ?? 0;
}

async function getRobloxFollowerCount(userId) {
  const data = await fetchJSON(`https://friends.roblox.com/v1/users/${userId}/followers/count`);
  return data.count ?? 0;
}

async function fetchRobloxProfileByUsername(username) {
  const searchResult = await searchRobloxUser(username);
  if (!searchResult) return null;

  const [profile, avatarUrl, friendCount, followerCount] = await Promise.all([
    getRobloxUser(searchResult.id),
    getRobloxAvatar(searchResult.id).catch(() => null),
    getRobloxFriendCount(searchResult.id).catch(() => 0),
    getRobloxFollowerCount(searchResult.id).catch(() => 0),
  ]);

  return { profile, avatarUrl, friendCount, followerCount };
}

function createRobloxEmbed(guild, robloxData, searchedNickname) {
  const { profile, avatarUrl, friendCount, followerCount } = robloxData;
  const createdAt = profile.created
    ? `<t:${Math.floor(new Date(profile.created).getTime() / 1000)}:D>`
    : 'Unknown';

  const description = profile.description?.trim()
    ? profile.description.length > 300
      ? `${profile.description.slice(0, 297)}…`
      : profile.description
    : '_No description set._';

  const embed = embeds
    .base(guild)
    .setColor(0xe8373e)
    .setTitle(`  ${profile.displayName} (@${profile.name})`)
    .setURL(`https://www.roblox.com/users/${profile.id}/profile`)
    .setDescription(description)
    .addFields(
      { name: '🆔  User ID', value: `\`${profile.id}\``, inline: true },
      { name: '  Account Created', value: createdAt, inline: true },
      { name: '  Friends', value: `${friendCount.toLocaleString()}`, inline: true },
      { name: '  Followers', value: `${followerCount.toLocaleString()}`, inline: true },
      { name: '  Banned', value: profile.isBanned ? ' Yes' : ' No', inline: true },
      { name: '  Searched Nickname', value: `\`${searchedNickname}\``, inline: true },
      {
        name: '  Profile Link',
        value: `[View on Roblox](https://www.roblox.com/users/${profile.id}/profile)`,
        inline: false,
      },
    );

  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

module.exports = {
  searchRobloxUser,
  getRobloxUser,
  getRobloxAvatar,
  getRobloxFriendCount,
  getRobloxFollowerCount,
  fetchRobloxProfileByUsername,
  createRobloxEmbed,
};
