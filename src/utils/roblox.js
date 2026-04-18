'use strict';

const https = require('https');
const embeds = require('./embeds');

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method ?? 'GET',
      headers: {
        'User-Agent': 'vcf-discord-bot/1.0',
        Accept: 'application/json',
        ...(options.headers ?? {}),
      },
    }, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`Roblox API request failed (${res.statusCode}).`);
            error.status = res.statusCode;
            reject(error);
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
          }
        });
      });
    request.on('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

async function searchRobloxUser(username) {
  const query = String(username ?? '').trim();
  if (!query) return null;
  try {
    const url = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(query)}&limit=10`;
    const data = await fetchJSON(url);
    if (data.data?.length) {
      const exact = data.data.find((u) => u.name.toLowerCase() === query.toLowerCase());
      return exact ?? data.data[0];
    }
  } catch (error) {
    if (error?.status !== 400) throw error;
  }

  const fallback = await fetchJSON('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usernames: [query],
      excludeBannedUsers: false,
    }),
  });
  const first = fallback?.data?.[0];
  if (!first) return null;
  return {
    id: first.id,
    name: first.name ?? first.requestedUsername ?? query,
    displayName: first.displayName ?? first.name ?? first.requestedUsername ?? query,
    hasVerifiedBadge: Boolean(first.hasVerifiedBadge),
  };
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
