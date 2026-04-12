'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { randomBytes } = require('crypto');
const embeds = require('../../utils/embeds');
const { isDevUser } = require('../../utils/roles');

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const REQUEST_TIMEOUT_MS = 30000;
const WEB_SEARCH_TIMEOUT_MS = 10000;
const MCP_DOCS_TIMEOUT_MS = 12000;
const REQUEST_TEMPERATURE = 0.1;
const MAX_TOOL_ROUNDS = 6;
const MAX_FIELDS = 10;
const MAX_COMPONENT_ROWS = 5;
const AI_COMPONENT_TTL_MINUTES = 10;
const AI_COMPONENT_TTL_MS = AI_COMPONENT_TTL_MINUTES * 60 * 1000;
const MAX_STORED_CONVERSATIONS = 500;
const CONVERSATION_STALE_HOURS = 6;
const WEB_SEARCH_DEFAULT_LIMIT = 5;
const WEB_SEARCH_MAX_LIMIT = 8;
const WEB_SEARCH_MAX_FLATTENED_RESULTS = 20;
const MCP_DOCS_URL = 'https://docs.valleycorrectional.xyz/mcp';
const MCP_DOCS_SNIPPET_MAX_CHARS = 3000;
const MAX_CONTEXT_MESSAGES = 24;
const MAX_TOOL_LOG_LINES = 12;
const STREAM_MIN_CHARS_PER_FRAME = 180;
const STREAM_MAX_FRAMES = 6;
const STREAM_FRAME_DELAY_MS = 220;

const AI_MODELS = Object.freeze([
  { displayName: 'Gemma 4 31B', value: 'google/gemma-4-31b-it' },
  { displayName: 'GLM 5', value: 'z-ai/glm5' },
  { displayName: 'MiniMax M2.7', value: 'minimaxai/minimax-m2.7' },
]);
const DEFAULT_MODEL = AI_MODELS[0].value;
const MODEL_DISPLAY_NAME_BY_VALUE = new Map(AI_MODELS.map((entry) => [entry.value, entry.displayName]));

const conversationStates = new Map();
const aiComponentStates = new Map();

function asString(value, fallback = '') {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
}

function truncate(text, max) {
  const normalized = asString(text, '').trim();
  if (!normalized) return '';
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return part.text ?? '';
      return '';
    })
    .join('\n')
    .trim();
}

function extractStructuredPayload(text) {
  const trimmed = asString(text, '').trim();
  if (!trimmed) return null;

  const direct = safeJsonParse(trimmed);
  if (direct && typeof direct === 'object') return direct;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch) {
    const parsed = safeJsonParse(fencedMatch[1]);
    if (parsed && typeof parsed === 'object') return parsed;
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const maybe = safeJsonParse(trimmed.slice(firstBrace, lastBrace + 1));
    if (maybe && typeof maybe === 'object') return maybe;
  }

  return null;
}

function getModelDisplayName(model) {
  return MODEL_DISPLAY_NAME_BY_VALUE.get(model) ?? model;
}

function getOpenRouterApiKey() {
  const value = asString(process.env.OPENROUTER_API_KEY, '').trim();
  return value || '';
}

function pruneConversationStates(now = Date.now()) {
  const entries = [...conversationStates.entries()]
    .sort((a, b) => (a[1]?.updatedAt ?? 0) - (b[1]?.updatedAt ?? 0));
  if (entries.length > MAX_STORED_CONVERSATIONS) {
    const overflow = entries.length - MAX_STORED_CONVERSATIONS;
    for (const [messageId] of entries.slice(0, overflow)) {
      conversationStates.delete(messageId);
    }
  }
  const staleCutoff = now - (CONVERSATION_STALE_HOURS * 60 * 60 * 1000);
  for (const [messageId, state] of conversationStates.entries()) {
    if ((state?.updatedAt ?? 0) < staleCutoff) conversationStates.delete(messageId);
  }
}

function pruneComponentStates(now = Date.now()) {
  for (const [token, state] of aiComponentStates.entries()) {
    if ((state?.expiresAt ?? 0) <= now) aiComponentStates.delete(token);
  }
}

function normalizeColor(value, fallback = 0x5865f2) {
  const colorValue = Number(value);
  if (Number.isInteger(colorValue) && colorValue >= 0 && colorValue <= 0xffffff) return colorValue;
  return fallback;
}

function normalizeButton(button) {
  const label = truncate(button?.label, 80);
  if (!label) return null;

  const rawStyle = asString(button?.style, 'primary').toLowerCase();
  const style = ['primary', 'secondary', 'success', 'danger', 'link'].includes(rawStyle) ? rawStyle : 'primary';
  const prompt = truncate(button?.prompt, 1500);
  const url = style === 'link' ? truncate(button?.url, 500) : '';

  if (style === 'link') {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    } catch {
      return null;
    }
  }

  return {
    label,
    style,
    prompt: style === 'link' ? '' : (prompt || label),
    url,
    disabled: Boolean(button?.disabled),
  };
}

function normalizeSelectMenu(selectMenu) {
  const placeholder = truncate(selectMenu?.placeholder, 150) || 'Choose an option';
  const rawOptions = Array.isArray(selectMenu?.options) ? selectMenu.options : [];
  const options = [];
  const seenValues = new Set();

  for (const [index, option] of rawOptions.entries()) {
    if (options.length >= 25) break;
    const label = truncate(option?.label, 100);
    if (!label) continue;
    const value = truncate(option?.value, 100) || `opt_${index + 1}`;
    if (seenValues.has(value)) continue;
    seenValues.add(value);
    const description = truncate(option?.description, 100);
    const prompt = truncate(option?.prompt, 1500) || label;
    options.push({
      label,
      value,
      description,
      prompt,
      default: Boolean(option?.default),
    });
  }

  if (!options.length) return null;

  const parsedMinValues = Number(selectMenu?.min_values);
  const parsedMaxValues = Number(selectMenu?.max_values);
  const requestedMinValues = Number.isFinite(parsedMinValues) ? parsedMinValues : 1;
  const requestedMaxValues = Number.isFinite(parsedMaxValues) ? parsedMaxValues : 1;
  const minValues = Math.min(options.length, Math.max(1, requestedMinValues));
  const maxValues = Math.min(options.length, Math.max(minValues, requestedMaxValues));

  return {
    placeholder,
    minValues,
    maxValues,
    options,
  };
}

function normalizePayload(payload, fallbackText) {
  const title = truncate(payload?.title, 256) || 'AI Response';
  const summary = truncate(payload?.summary, 4096) || truncate(fallbackText, 4096) || 'No response.';
  const answer = truncate(payload?.answer, 1024);
  const footer = truncate(payload?.footer, 2048);
  const color = normalizeColor(payload?.color);

  const fields = [];
  const rawFields = Array.isArray(payload?.fields) ? payload.fields : [];
  for (const field of rawFields) {
    if (fields.length >= MAX_FIELDS) break;
    const fieldName = truncate(field?.name, 256);
    const fieldValue = truncate(field?.value, 1024);
    if (!fieldName || !fieldValue) continue;

    const normalizedFieldButtons = Array.isArray(field?.buttons)
      ? field.buttons.map(normalizeButton).filter(Boolean).slice(0, 5)
      : [];
    const normalizedFieldSelects = Array.isArray(field?.select_menus)
      ? field.select_menus.map(normalizeSelectMenu).filter(Boolean).slice(0, 2)
      : [];

    fields.push({
      name: fieldName,
      value: fieldValue,
      inline: Boolean(field?.inline),
      buttons: normalizedFieldButtons,
      selectMenus: normalizedFieldSelects,
    });
  }

  const topButtons = Array.isArray(payload?.buttons)
    ? payload.buttons.map(normalizeButton).filter(Boolean).slice(0, 20)
    : [];
  const topSelectMenus = Array.isArray(payload?.select_menus)
    ? payload.select_menus.map(normalizeSelectMenu).filter(Boolean).slice(0, 5)
    : [];

  return {
    title,
    summary,
    answer,
    footer,
    color,
    fields,
    buttons: topButtons,
    selectMenus: topSelectMenus,
  };
}

function buildToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'get_server_overview',
        description: 'Get high-level stats and metadata for the current Discord server.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_vcf_mcp_docs',
        description: 'Fetch Valley Correctional MCP docs and return relevant snippets.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Optional keyword query used to filter docs lines.',
            },
            max_chars: {
              type: 'integer',
              minimum: 300,
              maximum: 3000,
              description: 'Maximum characters to return in docs snippet output.',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_web',
        description: 'Search the web for up-to-date public information and return concise result snippets.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query text.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 8,
              description: 'Maximum number of web results/snippets to return.',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_server_features',
        description: 'Get enabled server features and locale settings.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_current_channel',
        description: 'Get metadata for the current channel where the AI request was made.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_channels',
        description: 'List channels in this server, optionally filtered by type.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['all', 'text', 'voice', 'forum', 'announcement', 'category'],
              description: 'Channel type filter.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              description: 'Maximum number of channels to return.',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_channel_details',
        description: 'Get details for a specific channel by channel ID.',
        parameters: {
          type: 'object',
          properties: {
            channel_id: { type: 'string', description: 'Discord channel ID.' },
          },
          required: ['channel_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_roles',
        description: 'List server roles by highest position first.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              description: 'Maximum number of roles to return.',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_role_details',
        description: 'Get details for a role by role ID.',
        parameters: {
          type: 'object',
          properties: {
            role_id: { type: 'string', description: 'Discord role ID.' },
          },
          required: ['role_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'find_member',
        description: 'Find members by username, tag, nickname, or ID.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search term for username, display name, tag, or ID.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
              description: 'Maximum number of members to return.',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_members',
        description: 'List server members, optionally filtered to members with a specific role ID.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 25,
              description: 'Maximum number of members to return.',
            },
            role_id: {
              type: 'string',
              description: 'Optional role ID to filter members who have this role.',
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_member_details',
        description: 'Get details for a specific member by user ID.',
        parameters: {
          type: 'object',
          properties: {
            member_id: { type: 'string', description: 'Discord user ID of the member.' },
          },
          required: ['member_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_emojis',
        description: 'List custom server emojis with metadata.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              description: 'Maximum number of emojis to return.',
            },
          },
          additionalProperties: false,
        },
      },
    },
  ];
}

function formatChannel(channel) {
  if (!channel) return null;
  return {
    id: channel.id,
    name: channel.name ?? channel.id,
    type: ChannelType[channel.type] ?? String(channel.type),
    parentId: channel.parentId ?? null,
    position: Number.isFinite(channel.position) ? channel.position : null,
    nsfw: Boolean(channel.nsfw),
    topic: truncate(channel.topic, 300),
  };
}

function formatMember(member) {
  if (!member) return null;
  const topRoles = [...member.roles.cache.values()]
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .slice(0, 8)
    .map((role) => ({ id: role.id, name: role.name }));

  return {
    id: member.id,
    username: member.user.username,
    tag: member.user.tag,
    displayName: member.displayName,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    createdAt: member.user.createdAt?.toISOString() ?? null,
    bot: member.user.bot,
    roles: topRoles,
  };
}

function flattenDuckDuckGoRelatedTopics(topics = [], results = []) {
  for (const topic of topics) {
    if (results.length >= WEB_SEARCH_MAX_FLATTENED_RESULTS) break;
    if (Array.isArray(topic?.Topics)) {
      flattenDuckDuckGoRelatedTopics(topic.Topics, results);
      continue;
    }
    const text = truncate(topic?.Text, 280);
    if (!text) continue;
    const url = asString(topic?.FirstURL, '').trim();
    results.push({ text, url });
  }
  return results;
}

async function runWebSearch(query, limit = WEB_SEARCH_DEFAULT_LIMIT) {
  const normalizedQuery = asString(query, '').trim();
  if (!normalizedQuery) return { ok: false, error: 'query is required.' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT_MS);
  try {
    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', normalizedQuery);
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, error: `Web search failed with status ${response.status}.` };
    }

    const data = await response.json();
    const snippets = [];

    const abstractText = truncate(data?.AbstractText, 300);
    const abstractUrl = asString(data?.AbstractURL, '').trim();
    if (abstractText) snippets.push({ text: abstractText, url: abstractUrl });

    const related = flattenDuckDuckGoRelatedTopics(data?.RelatedTopics ?? []);
    for (const item of related) {
      if (snippets.length >= limit) break;
      snippets.push(item);
    }

    return {
      ok: true,
      query: normalizedQuery,
      heading: truncate(data?.Heading, 120),
      snippets: snippets.slice(0, limit),
      source: 'DuckDuckGo Instant Answer API',
    };
  } catch (error) {
    return {
      ok: false,
      error: `Web search request failed: ${truncate(error.message, 300)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtmlToText(html) {
  return asString(html, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function runMcpDocsTool(query, maxChars) {
  const limit = Math.min(
    MCP_DOCS_SNIPPET_MAX_CHARS,
    Math.max(300, Number(maxChars) || 1200),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_DOCS_TIMEOUT_MS);
  try {
    const response = await fetch(MCP_DOCS_URL, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, error: `MCP docs request failed with status ${response.status}.` };
    }

    const html = await response.text();
    const plainText = stripHtmlToText(html);
    if (!plainText) return { ok: false, error: 'MCP docs response was empty.' };

    const lines = plainText
      .split(/(?<=[.!?])\s+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const normalizedQuery = asString(query, '').trim().toLowerCase();
    const relevant = normalizedQuery
      ? lines.filter((line) => line.toLowerCase().includes(normalizedQuery))
      : lines;

    const selectedLines = (relevant.length > 0 ? relevant : lines).slice(0, 25);
    const snippet = truncate(selectedLines.join('\n'), limit);

    return {
      ok: true,
      source: MCP_DOCS_URL,
      query: normalizedQuery || null,
      snippet,
      matchedLines: relevant.length,
    };
  } catch (error) {
    return {
      ok: false,
      error: `MCP docs request failed: ${truncate(error.message, 300)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runTool(context, name, args) {
  const guild = context.guild;
  const parsedArgs = typeof args === 'string' ? safeJsonParse(args) ?? {} : args ?? {};

  if (name === 'get_vcf_mcp_docs') {
    return runMcpDocsTool(parsedArgs.query, parsedArgs.max_chars);
  }

  if (name === 'search_web') {
    const limit = Math.min(WEB_SEARCH_MAX_LIMIT, Math.max(1, Number(parsedArgs.limit) || WEB_SEARCH_DEFAULT_LIMIT));
    return runWebSearch(parsedArgs.query, limit);
  }

  if (!guild) {
    return { ok: false, error: 'Guild context is required for this tool.' };
  }

  if (name === 'get_server_overview') {
    return {
      ok: true,
      server: {
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        roleCount: guild.roles.cache.size,
        channelCount: guild.channels.cache.size,
        emojiCount: guild.emojis.cache.size,
        verificationLevel: guild.verificationLevel,
        nsfwLevel: guild.nsfwLevel,
        boostLevel: guild.premiumTier,
      },
    };
  }

  if (name === 'get_server_features') {
    return {
      ok: true,
      features: [...(guild.features ?? [])],
      preferredLocale: guild.preferredLocale ?? null,
      explicitContentFilter: guild.explicitContentFilter ?? null,
      mfaLevel: guild.mfaLevel ?? null,
    };
  }

  if (name === 'get_current_channel') {
    return {
      ok: true,
      channel: formatChannel(context.channel),
    };
  }

  if (name === 'list_channels') {
    const wantedType = asString(parsedArgs.type, 'all').toLowerCase();
    const limit = Math.min(50, Math.max(1, Number(parsedArgs.limit) || 15));

    let channels = [...guild.channels.cache.values()].sort((a, b) => a.position - b.position);
    channels = channels.filter((channel) => {
      switch (wantedType) {
        case 'text':
          return channel.type === ChannelType.GuildText;
        case 'voice':
          return channel.type === ChannelType.GuildVoice;
        case 'forum':
          return channel.type === ChannelType.GuildForum;
        case 'announcement':
          return channel.type === ChannelType.GuildAnnouncement;
        case 'category':
          return channel.type === ChannelType.GuildCategory;
        default:
          return true;
      }
    });

    return {
      ok: true,
      filter: wantedType,
      channels: channels.slice(0, limit).map(formatChannel),
      totalMatching: channels.length,
    };
  }

  if (name === 'get_channel_details') {
    const channelId = asString(parsedArgs.channel_id, '').trim();
    if (!channelId) return { ok: false, error: 'channel_id is required.' };
    const channel = guild.channels.cache.get(channelId) ?? null;
    if (!channel) return { ok: false, error: 'Channel not found.' };
    return { ok: true, channel: formatChannel(channel) };
  }

  if (name === 'list_roles') {
    const limit = Math.min(50, Math.max(1, Number(parsedArgs.limit) || 15));
    const roles = [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .slice(0, limit);

    return {
      ok: true,
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        memberCount: role.members.size,
        mentionable: role.mentionable,
      })),
      totalRoles: guild.roles.cache.size - 1,
    };
  }

  if (name === 'get_role_details') {
    const roleId = asString(parsedArgs.role_id, '').trim();
    if (!roleId) return { ok: false, error: 'role_id is required.' };
    const role = guild.roles.cache.get(roleId) ?? null;
    if (!role || role.id === guild.id) return { ok: false, error: 'Role not found.' };
    return {
      ok: true,
      role: {
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        memberCount: role.members.size,
        mentionable: role.mentionable,
        managed: role.managed,
      },
    };
  }

  if (name === 'find_member') {
    const query = asString(parsedArgs.query, '').trim().toLowerCase();
    const limit = Math.min(20, Math.max(1, Number(parsedArgs.limit) || 8));
    if (!query) return { ok: false, error: 'query is required.' };

    const results = [...guild.members.cache.values()]
      .filter((member) => {
        const username = member.user.username.toLowerCase();
        const tag = member.user.tag.toLowerCase();
        const displayName = member.displayName.toLowerCase();
        return (
          member.id.includes(query)
          || username.includes(query)
          || tag.includes(query)
          || displayName.includes(query)
        );
      })
      .slice(0, limit)
      .map(formatMember);

    return {
      ok: true,
      query,
      results,
      totalReturned: results.length,
    };
  }

  if (name === 'list_members') {
    const limit = Math.min(25, Math.max(1, Number(parsedArgs.limit) || 10));
    const roleId = asString(parsedArgs.role_id, '').trim();
    let members = [...guild.members.cache.values()];
    if (roleId) {
      members = members.filter((member) => member.roles.cache.has(roleId));
    }
    const selected = members
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, limit)
      .map(formatMember);

    return {
      ok: true,
      roleFilter: roleId || null,
      members: selected,
      totalMatching: members.length,
    };
  }

  if (name === 'get_member_details') {
    const memberId = asString(parsedArgs.member_id, '').trim();
    if (!memberId) return { ok: false, error: 'member_id is required.' };
    const member = guild.members.cache.get(memberId) ?? null;
    if (!member) return { ok: false, error: 'Member not found in this guild.' };
    return {
      ok: true,
      member: formatMember(member),
    };
  }

  if (name === 'list_emojis') {
    const limit = Math.min(50, Math.max(1, Number(parsedArgs.limit) || 20));
    const emojis = [...guild.emojis.cache.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit)
      .map((emoji) => ({
        id: emoji.id,
        name: emoji.name,
        animated: emoji.animated,
        available: emoji.available,
      }));

    return {
      ok: true,
      emojis,
      totalEmojis: guild.emojis.cache.size,
    };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

async function requestOpenRouterChat({ apiKey, model, messages, tools }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: REQUEST_TEMPERATURE,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter API ${response.status} (${model}): ${truncate(body, 400)}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildSystemPrompt(model) {
  return [
    'You are an assistant for a Discord moderation/community server.',
    'Use tools when needed to inspect server context.',
    'Safety rules:',
    '- Never claim to execute moderation or administrative actions.',
    '- Never request, expose, or infer secrets/tokens/credentials.',
    '- Only use the provided read-only tools for server context.',
    '- Refuse harmful, abusive, illegal, or privacy-invasive requests.',
    '- Keep responses professional and concise.',
    '- Keep formatting consistent between runs.',
    '- Use search_web only for general public info and cite uncertainty when needed.',
    '- Use get_vcf_mcp_docs for Valley Correctional MCP docs lookups.',
    '',
    `Model display name: ${getModelDisplayName(model)}.`,
    'Return ONLY valid JSON with this structure:',
    '{',
    '  "title": "short title",',
    '  "summary": "high-level summary",',
    '  "answer": "main answer text",',
    '  "fields": [',
    '    {',
    '      "name": "field name",',
    '      "value": "field value",',
    '      "inline": false,',
    '      "buttons": [',
    '        {"label":"button text","style":"primary|secondary|success|danger|link","prompt":"follow-up prompt","url":"https://example.com"}',
    '      ],',
    '      "select_menus": [',
    '        {"placeholder":"Choose option","options":[{"label":"Option A","value":"a","description":"Optional","prompt":"follow-up prompt"}]}',
    '      ]',
    '    }',
    '  ],',
    '  "buttons": [',
    '    {"label":"button text","style":"primary|secondary|success|danger|link","prompt":"follow-up prompt","url":"https://example.com"}',
    '  ],',
    '  "select_menus": [',
    '    {"placeholder":"Choose option","options":[{"label":"Option A","value":"a","description":"Optional","prompt":"follow-up prompt"}]}',
    '  ],',
    '  "footer": "short footer",',
    '  "color": 5793266',
    '}',
    'Guidance for consistency:',
    '- Keep title and summary stable and clear.',
    '- Use answer for main output and fields for structured detail.',
    '- Add buttons/select menus only when they provide clear next steps.',
  ].join('\n');
}

function trimMessagesForContext(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const systemMessage = messages.find((msg) => msg?.role === 'system') ?? null;
  const nonSystem = messages.filter((msg) => msg?.role !== 'system').slice(-MAX_CONTEXT_MESSAGES);
  return systemMessage ? [systemMessage, ...nonSystem] : nonSystem;
}

async function runAiCompletion({
  apiKey,
  model,
  context,
  prompt,
  priorMessages = [],
  onProgress = null,
}) {
  const tools = buildToolDefinitions();
  const messages = priorMessages.length
    ? [...priorMessages]
    : [{ role: 'system', content: buildSystemPrompt(model) }];

  if (!messages.some((msg) => msg?.role === 'system')) {
    messages.unshift({ role: 'system', content: buildSystemPrompt(model) });
  }

  messages.push({ role: 'user', content: prompt });

  let rawFinalText = '';
  let structured = null;
  const toolUsage = [];

  if (typeof onProgress === 'function') {
    await onProgress({ type: 'phase', phase: 'Calling model…' });
  }

  for (let i = 0; i < MAX_TOOL_ROUNDS; i += 1) {
    if (typeof onProgress === 'function') {
      await onProgress({ type: 'phase', phase: `Model round ${i + 1}/${MAX_TOOL_ROUNDS}…` });
    }

    const data = await requestOpenRouterChat({
      apiKey,
      model,
      messages,
      tools,
    });

    const choice = data?.choices?.[0]?.message;
    if (!choice) throw new Error(`No response choices were returned by the AI provider (${model}).`);

    const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: choice.content ?? '',
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const toolName = call?.function?.name;
        const toolArgs = call?.function?.arguments ?? '{}';
        if (typeof onProgress === 'function') {
          await onProgress({
            type: 'tool_start',
            name: toolName,
            args: toolArgs,
          });
        }
        const result = await runTool(context, toolName, toolArgs);
        toolUsage.push({
          name: asString(toolName, 'unknown_tool'),
          args: truncate(asString(toolArgs, '{}'), 220),
          ok: result?.ok !== false,
          error: truncate(asString(result?.error, ''), 160),
        });
        if (typeof onProgress === 'function') {
          await onProgress({
            type: 'tool_result',
            name: toolName,
            ok: result?.ok !== false,
            error: result?.error ?? '',
          });
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    rawFinalText = extractTextContent(choice.content);
    structured = extractStructuredPayload(rawFinalText);
    if (typeof onProgress === 'function') {
      await onProgress({ type: 'phase', phase: 'Streaming response…' });
      await onProgress({ type: 'final_text', text: rawFinalText });
    }
    messages.push({ role: 'assistant', content: rawFinalText || choice.content || '' });
    break;
  }

  return {
    rawFinalText,
    structured,
    toolUsage,
    messages: trimMessagesForContext(messages),
  };
}

function createAiEmbed(guild, payload, modelDisplayName) {
  const embed = new EmbedBuilder()
    .setColor(payload.color)
    .setTitle(payload.title)
    .setDescription(payload.summary)
    .setTimestamp()
    .setFooter({
      text: payload.footer || `${guild?.name ?? 'Server'} · ${modelDisplayName}`,
      iconURL: guild?.iconURL({ dynamic: true }) ?? undefined,
    });

  if (payload.answer) {
    embed.addFields({
      name: 'Answer',
      value: payload.answer,
    });
  }

  for (const field of payload.fields) {
    embed.addFields({
      name: field.name,
      value: field.value,
      inline: field.inline,
    });
  }

  return embed;
}

function formatToolUsageLines(toolUsage) {
  const entries = Array.isArray(toolUsage) ? toolUsage : [];
  if (!entries.length) return ['No tools were used in this response.'];
  return entries
    .slice(-MAX_TOOL_LOG_LINES)
    .map((entry, index) => {
      const status = entry.ok ? '✅' : '❌';
      const args = entry.args ? ` · args: \`${truncate(entry.args, 120)}\`` : '';
      const err = entry.ok ? '' : ` · ${truncate(entry.error, 90)}`;
      return `${index + 1}. ${status} \`${entry.name}\`${args}${err}`;
    });
}

function createAiToolsEmbed(guild, modelDisplayName, toolUsage) {
  const lines = formatToolUsageLines(toolUsage);
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('AI Tool Usage')
    .setDescription(lines.join('\n').slice(0, 4096))
    .setTimestamp()
    .setFooter({
      text: `${guild?.name ?? 'Server'} · ${modelDisplayName}`,
      iconURL: guild?.iconURL({ dynamic: true }) ?? undefined,
    });
}

function createAiStreamingEmbed(guild, modelDisplayName, phase, toolUsage, partialText = '') {
  const lines = formatToolUsageLines(toolUsage);
  const description = truncate(partialText, 1800) || 'Waiting for model output…';
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('AI Response (Streaming)')
    .setDescription(description)
    .setTimestamp()
    .setFooter({
      text: `${guild?.name ?? 'Server'} · ${modelDisplayName}`,
      iconURL: guild?.iconURL({ dynamic: true }) ?? undefined,
    })
    .addFields({
      name: 'Status',
      value: truncate(phase || 'Working…', 1024),
      inline: false,
    }, {
      name: 'Tools Used (Live)',
      value: lines.join('\n').slice(0, 1024),
      inline: false,
    });
  return embed;
}

function buildStreamFrames(text) {
  const normalized = asString(text, '').trim();
  if (!normalized) return [];
  const frameCount = Math.min(
    STREAM_MAX_FRAMES,
    Math.max(2, Math.ceil(normalized.length / STREAM_MIN_CHARS_PER_FRAME)),
  );
  const step = Math.max(1, Math.floor(normalized.length / frameCount));
  const frames = [];
  for (let i = step; i < normalized.length; i += step) {
    frames.push(normalized.slice(0, i));
  }
  frames.push(normalized);
  return frames.slice(0, STREAM_MAX_FRAMES);
}

function resolveButtonStyle(style) {
  switch (style) {
    case 'secondary':
      return ButtonStyle.Secondary;
    case 'success':
      return ButtonStyle.Success;
    case 'danger':
      return ButtonStyle.Danger;
    case 'link':
      return ButtonStyle.Link;
    default:
      return ButtonStyle.Primary;
  }
}

function newComponentToken() {
  return randomBytes(16).toString('hex');
}

function buildAiComponents(payload, ownerId) {
  pruneComponentStates();

  const token = newComponentToken();
  const interactiveButtons = [];
  const interactiveSelectMenus = [];

  const orderedButtons = [
    ...payload.buttons,
    ...payload.fields.flatMap((field) => field.buttons ?? []),
  ].slice(0, 20);

  const orderedSelectMenus = [
    ...payload.selectMenus,
    ...payload.fields.flatMap((field) => field.selectMenus ?? []),
  ].slice(0, 8);

  const actionRows = [];
  let usedRows = 0;
  const maxActionRows = MAX_COMPONENT_ROWS - 1;

  let buttonCursor = 0;
  while (buttonCursor < orderedButtons.length && usedRows < maxActionRows) {
    const row = new ActionRowBuilder();
    let added = 0;

    while (buttonCursor < orderedButtons.length && added < 5) {
      const button = orderedButtons[buttonCursor];
      buttonCursor += 1;
      const style = resolveButtonStyle(button.style);

      if (button.style === 'link') {
        if (!button.url) continue;
        row.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(button.label)
            .setURL(button.url)
            .setDisabled(button.disabled),
        );
        added += 1;
        continue;
      }

      const actionIndex = interactiveButtons.length;
      interactiveButtons.push({ prompt: button.prompt || button.label });
      row.addComponents(
        new ButtonBuilder()
          .setStyle(style)
          .setLabel(button.label)
          .setCustomId(`ai_btn:${ownerId}:${token}:${actionIndex}`)
          .setDisabled(button.disabled),
      );
      added += 1;
    }

    if (row.components.length > 0) {
      actionRows.push(row);
      usedRows += 1;
    }
  }

  for (const selectMenu of orderedSelectMenus) {
    if (usedRows >= maxActionRows) break;

    const actionIndex = interactiveSelectMenus.length;
    const optionPrompts = Object.fromEntries(selectMenu.options.map((option) => [option.value, option.prompt]));
    interactiveSelectMenus.push({ optionPrompts });

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`ai_sel:${ownerId}:${token}:${actionIndex}`)
      .setPlaceholder(selectMenu.placeholder)
      .setMinValues(selectMenu.minValues)
      .setMaxValues(selectMenu.maxValues)
      .addOptions(selectMenu.options.map((option) => ({
        label: option.label,
        value: option.value,
        description: option.description || undefined,
        default: option.default,
      })));

    actionRows.push(new ActionRowBuilder().addComponents(menu));
    usedRows += 1;
  }

  return {
    token,
    actionRows,
    interactiveButtons,
    interactiveSelectMenus,
  };
}

function buildAiViewToggleRow(ownerId, token, activeView) {
  const currentView = activeView === 'tools' ? 'tools' : 'output';
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Output View')
      .setCustomId(`ai_view:${ownerId}:${token}:output`)
      .setDisabled(currentView === 'output'),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Tools View')
      .setCustomId(`ai_view:${ownerId}:${token}:tools`)
      .setDisabled(currentView === 'tools'),
  );
}

function buildAiViewComponents(ownerId, token, actionRows, activeView) {
  const rows = [buildAiViewToggleRow(ownerId, token, activeView)];
  rows.push(...(Array.isArray(actionRows) ? actionRows.slice(0, MAX_COMPONENT_ROWS - 1) : []));
  return rows;
}

function registerAiComponentState({
  token,
  ownerId,
  interactiveButtons,
  interactiveSelectMenus,
  actionRows,
  outputEmbed,
  toolsEmbed,
}) {
  aiComponentStates.set(token, {
    token,
    ownerId,
    interactiveButtons: Array.isArray(interactiveButtons) ? interactiveButtons : [],
    interactiveSelectMenus: Array.isArray(interactiveSelectMenus) ? interactiveSelectMenus : [],
    actionRows: Array.isArray(actionRows) ? actionRows : [],
    outputEmbed,
    toolsEmbed,
    expiresAt: Date.now() + AI_COMPONENT_TTL_MS,
  });
}

function buildAiOutputPayload(state) {
  return {
    embeds: [state.outputEmbed],
    components: buildAiViewComponents(state.ownerId, state.token, state.actionRows, 'output'),
  };
}

function buildAiToolsPayload(state) {
  return {
    embeds: [state.toolsEmbed],
    components: buildAiViewComponents(state.ownerId, state.token, state.actionRows, 'tools'),
  };
}

function storeConversationState(messageId, state) {
  conversationStates.set(messageId, {
    ...state,
    updatedAt: Date.now(),
  });
  pruneConversationStates();
}

function getConversationState(messageId) {
  pruneConversationStates();
  return conversationStates.get(messageId) ?? null;
}

function hasConversationState(messageId) {
  return getConversationState(messageId) !== null;
}

function buildInteractionContext(source) {
  return {
    guild: source.guild,
    channel: source.channel,
    user: source.user ?? source.author,
  };
}

async function generateAiResponse({
  source,
  prompt,
  model,
  priorMessages,
  progressEditor = null,
}) {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured.');
  }

  const modelDisplayName = getModelDisplayName(model);
  let phase = 'Preparing request…';
  const liveToolUsage = [];

  const pushProgressUpdate = async (partialText = '') => {
    if (typeof progressEditor !== 'function') return;
    await progressEditor({
      embeds: [createAiStreamingEmbed(source.guild, modelDisplayName, phase, liveToolUsage, partialText)],
      components: [],
    });
  };

  await pushProgressUpdate('');

  const completion = await runAiCompletion({
    apiKey,
    model,
    context: buildInteractionContext(source),
    prompt,
    priorMessages,
    onProgress: async (event) => {
      if (event?.type === 'phase') {
        phase = event.phase || phase;
        await pushProgressUpdate('');
        return;
      }
      if (event?.type === 'tool_start') {
        phase = `Running tool: ${event.name ?? 'unknown'}…`;
        await pushProgressUpdate('');
        return;
      }
      if (event?.type === 'tool_result') {
        liveToolUsage.push({
          name: asString(event.name, 'unknown_tool'),
          args: '',
          ok: event.ok !== false,
          error: truncate(asString(event.error, ''), 160),
        });
        phase = event.ok === false ? `Tool failed: ${event.name ?? 'unknown'}` : `Tool complete: ${event.name ?? 'unknown'}`;
        await pushProgressUpdate('');
        return;
      }
      if (event?.type === 'final_text') {
        const frames = buildStreamFrames(event.text);
        for (const frame of frames) {
          await pushProgressUpdate(frame);
          await sleep(STREAM_FRAME_DELAY_MS);
        }
      }
    },
  });

  const normalized = normalizePayload(completion.structured, completion.rawFinalText);
  const outputEmbed = createAiEmbed(source.guild, normalized, modelDisplayName);
  const toolsEmbed = createAiToolsEmbed(source.guild, modelDisplayName, completion.toolUsage);
  const ownerId = source.user?.id ?? source.author?.id;
  let outputPayload = { embeds: [outputEmbed], components: [] };
  let toolsPayload = { embeds: [toolsEmbed], components: [] };

  if (ownerId) {
    const componentBundle = buildAiComponents(normalized, ownerId);
    registerAiComponentState({
      token: componentBundle.token,
      ownerId,
      interactiveButtons: componentBundle.interactiveButtons,
      interactiveSelectMenus: componentBundle.interactiveSelectMenus,
      actionRows: componentBundle.actionRows,
      outputEmbed,
      toolsEmbed,
    });
    const state = aiComponentStates.get(componentBundle.token);
    if (state) {
      outputPayload = buildAiOutputPayload(state);
      toolsPayload = buildAiToolsPayload(state);
    }
  }

  return {
    outputPayload,
    toolsPayload,
    completionMessages: completion.messages,
    model,
  };
}

function parseAiComponentCustomId(customId) {
  const parts = asString(customId, '').split(':');
  if (parts.length !== 4) return null;
  const [kind, ownerId, token, actionIndexRaw] = parts;
  if (kind !== 'ai_btn' && kind !== 'ai_sel') return null;
  if (actionIndexRaw.length > 6) return null;
  if (!/^\d+$/.test(actionIndexRaw)) return null;
  const actionIndex = Number.parseInt(actionIndexRaw, 10);
  if (!Number.isInteger(actionIndex) || actionIndex < 0) return null;
  return {
    kind,
    ownerId,
    token,
    actionIndex,
  };
}

function parseAiViewCustomId(customId) {
  const parts = asString(customId, '').split(':');
  if (parts.length !== 4) return null;
  const [kind, ownerId, token, view] = parts;
  if (kind !== 'ai_view') return null;
  if (view !== 'output' && view !== 'tools') return null;
  return {
    ownerId,
    token,
    view,
  };
}

function isAiComponentCustomId(customId) {
  const value = asString(customId, '');
  return value.startsWith('ai_btn:') || value.startsWith('ai_sel:') || value.startsWith('ai_view:');
}

async function handleAiComponentInteraction(interaction) {
  const viewToggle = parseAiViewCustomId(interaction.customId);
  const parsed = parseAiComponentCustomId(interaction.customId);
  if (!viewToggle && !parsed) return false;

  pruneComponentStates();

  const ownerId = viewToggle?.ownerId ?? parsed?.ownerId;
  if (ownerId !== interaction.user.id) {
    await interaction.reply({
      embeds: [embeds.error('These AI controls belong to someone else.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const token = viewToggle?.token ?? parsed?.token;
  const state = aiComponentStates.get(token);
  if (!state || state.ownerId !== ownerId) {
    await interaction.reply({
      embeds: [embeds.warning('These AI controls have expired. Run `/ai` again.', interaction.guild)],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (viewToggle) {
    if (viewToggle.view === 'tools') {
      await interaction.update(buildAiToolsPayload(state));
    } else {
      await interaction.update(buildAiOutputPayload(state));
    }
    return true;
  }

  let followupPrompt = '';

  if (parsed.kind === 'ai_btn') {
    const action = state.interactiveButtons[parsed.actionIndex];
    if (!action) {
      await interaction.reply({
        embeds: [embeds.warning('That AI button action is no longer available.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    followupPrompt = truncate(action.prompt, 1500);
  }

  if (parsed.kind === 'ai_sel') {
    const action = state.interactiveSelectMenus[parsed.actionIndex];
    const selectedValues = Array.isArray(interaction.values) ? interaction.values : [];
    followupPrompt = truncate(
      selectedValues
        .map((value) => action?.optionPrompts?.[value])
        .filter(Boolean)
        .join('\n'),
      1500,
    );
    if (!followupPrompt) {
      await interaction.reply({
        embeds: [embeds.warning('That AI menu option has no continuation prompt.', interaction.guild)],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
  }

  const previous = getConversationState(interaction.message.id);
  const model = previous?.model ?? DEFAULT_MODEL;

  await interaction.deferReply();

  try {
    const response = await generateAiResponse({
      source: interaction,
      prompt: followupPrompt,
      model,
      priorMessages: previous?.messages ?? [],
      progressEditor: async (payload) => interaction.editReply(payload),
    });

    const sentMessage = await interaction.editReply(response.outputPayload);

    storeConversationState(sentMessage.id, {
      userId: interaction.user.id,
      model: response.model,
      messages: response.completionMessages,
    });
  } catch (error) {
    await interaction.editReply({
      embeds: [
        embeds.error(
          `AI request failed: ${truncate(error.message, 500)}`,
          interaction.guild ?? null,
        ),
      ],
      components: [],
    });
  }

  return true;
}

async function handleAiReplyMessage(message) {
  if (message.author.bot || !message.guild || !message.reference?.messageId) return false;
  if (!isDevUser(message.author.id)) return false;

  const reference = await message.fetchReference().catch(() => null);
  if (!reference || reference.author.id !== message.client.user.id) return false;
  if (!hasConversationState(reference.id)) return false;

  const prompt = asString(message.content, '').trim();
  if (!prompt) {
    await message.reply({
      embeds: [embeds.warning('Reply with a prompt to continue the AI conversation.', message.guild)],
    }).catch(() => null);
    return true;
  }

  const previous = getConversationState(reference.id);
  const model = previous?.model ?? DEFAULT_MODEL;

  const progressMessage = await message.reply({
    embeds: [createAiStreamingEmbed(message.guild, getModelDisplayName(model), 'Preparing request…', [], '')],
    components: [],
  }).catch(() => null);
  if (!progressMessage) return true;

  try {
    const response = await generateAiResponse({
      source: message,
      prompt,
      model,
      priorMessages: previous?.messages ?? [],
      progressEditor: async (payload) => progressMessage.edit(payload),
    });

    const sentMessage = await progressMessage.edit(response.outputPayload);

    storeConversationState(sentMessage.id, {
      userId: message.author.id,
      model: response.model,
      messages: response.completionMessages,
    });
  } catch (error) {
    await progressMessage.edit({
      embeds: [
        embeds.error(
          `AI request failed: ${truncate(error.message, 500)}`,
          message.guild ?? null,
        ),
      ],
      components: [],
    }).catch(() => null);
  }

  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('[Dev] Ask AI and return a structured embedded answer.')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('prompt')
        .setDescription('What you want the AI to do.')
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('model')
        .setDescription('Which model to use.')
        .setRequired(false)
        .addChoices(
          ...AI_MODELS.map((entry) => ({ name: entry.displayName, value: entry.value })),
        ),
    ),

  isAiComponentCustomId,
  handleAiComponentInteraction,
  handleAiReplyMessage,

  async execute(interaction) {
    if (!isDevUser(interaction.user.id)) {
      await interaction.reply({
        embeds: [embeds.error('This command is restricted to the bot developer.', interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      await interaction.reply({
        embeds: [
          embeds.error(
            'OPENROUTER_API_KEY is not configured. Add it to your environment before using `/ai`.',
            interaction.guild ?? null,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userPrompt = interaction.options.getString('prompt', true).trim();
    const model = interaction.options.getString('model') ?? DEFAULT_MODEL;

    await interaction.deferReply();

    try {
      const response = await generateAiResponse({
        source: interaction,
        prompt: userPrompt,
        model,
        priorMessages: [],
        progressEditor: async (payload) => interaction.editReply(payload),
      });

      const sentMessage = await interaction.editReply(response.outputPayload);

      storeConversationState(sentMessage.id, {
        userId: interaction.user.id,
        model: response.model,
        messages: response.completionMessages,
      });
    } catch (error) {
      await interaction.editReply({
        embeds: [
          embeds.error(
            `AI request failed: ${truncate(error.message, 500)}`,
            interaction.guild ?? null,
          ),
        ],
        components: [],
      });
      return null;
    }

  },
};
