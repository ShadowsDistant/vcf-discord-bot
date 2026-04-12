'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  ChannelType,
} = require('discord.js');
const embeds = require('../../utils/embeds');
const { isDevUser } = require('../../utils/roles');

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_MODEL = 'google/gemma-4-31b-it';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_TOOL_ROUNDS = 4;
const MAX_FIELDS = 8;

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
              maximum: 25,
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
        name: 'list_roles',
        description: 'List the server roles by highest position first.',
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 25,
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
        name: 'find_member',
        description: 'Find members in the current server by username, tag, nickname, or ID.',
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
              maximum: 10,
              description: 'Maximum number of members to return.',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
  ];
}

function runTool(interaction, name, args) {
  const guild = interaction.guild;
  const parsedArgs = typeof args === 'string' ? safeJsonParse(args) ?? {} : args ?? {};

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

  if (name === 'list_channels') {
    const wantedType = asString(parsedArgs.type, 'all').toLowerCase();
    const limit = Math.min(25, Math.max(1, Number(parsedArgs.limit) || 10));

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
      channels: channels.slice(0, limit).map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: ChannelType[channel.type] ?? String(channel.type),
      })),
      totalMatching: channels.length,
    };
  }

  if (name === 'list_roles') {
    const limit = Math.min(25, Math.max(1, Number(parsedArgs.limit) || 10));
    const roles = [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .slice(0, limit);

    return {
      ok: true,
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position,
        memberCount: role.members.size,
      })),
      totalRoles: guild.roles.cache.size - 1,
    };
  }

  if (name === 'find_member') {
    const query = asString(parsedArgs.query, '').trim().toLowerCase();
    const limit = Math.min(10, Math.max(1, Number(parsedArgs.limit) || 5));
    if (!query) {
      return { ok: false, error: 'query is required.' };
    }

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
      .map((member) => ({
        id: member.id,
        username: member.user.username,
        tag: member.user.tag,
        displayName: member.displayName,
      }));

    return {
      ok: true,
      query,
      results,
      totalReturned: results.length,
    };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

async function requestNvidiaChat({ apiKey, messages, tools }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`NVIDIA API ${response.status}: ${truncate(body, 400)}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function createAiEmbed(interaction, payload, fallbackText) {
  const title = truncate(payload?.title, 256) || 'AI Response';
  const summary = truncate(payload?.summary, 4096) || truncate(fallbackText, 4096) || 'No response.';
  const answer = truncate(payload?.answer, 1024);
  const footer = truncate(payload?.footer, 2048);
  const colorValue = Number(payload?.color);
  const color = Number.isInteger(colorValue) && colorValue >= 0 && colorValue <= 0xffffff
    ? colorValue
    : 0x5865f2;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(summary)
    .setTimestamp()
    .setFooter({
      text: footer || `${interaction.guild?.name ?? 'Server'} · ${NVIDIA_MODEL}`,
      iconURL: interaction.guild?.iconURL({ dynamic: true }) ?? undefined,
    });

  if (answer) {
    embed.addFields({
      name: 'Answer',
      value: answer,
    });
  }

  const fields = Array.isArray(payload?.fields) ? payload.fields : [];
  for (const field of fields.slice(0, MAX_FIELDS)) {
    const fieldName = truncate(field?.name, 256);
    const fieldValue = truncate(field?.value, 1024);
    if (!fieldName || !fieldValue) continue;
    embed.addFields({
      name: fieldName,
      value: fieldValue,
      inline: Boolean(field?.inline),
    });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('[Dev] Ask NVIDIA AI and return a structured embedded answer.')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('prompt')
        .setDescription('What you want the AI to do.')
        .setRequired(true),
    ),

  async execute(interaction) {
    if (!isDevUser(interaction.user.id)) {
      return interaction.reply({
        embeds: [embeds.error('This command is restricted to the bot developer.', interaction.guild ?? null)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      return interaction.reply({
        embeds: [
          embeds.error(
            'NVIDIA_API_KEY is not configured. Add it to your environment before using `/ai`.',
            interaction.guild ?? null,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const userPrompt = interaction.options.getString('prompt', true).trim();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const systemPrompt = [
      'You are an assistant for a Discord moderation/community server.',
      'Use tools when needed to inspect server context.',
      'Return ONLY valid JSON with this structure:',
      '{',
      '  "title": "short title",',
      '  "summary": "high-level summary",',
      '  "answer": "main answer text",',
      '  "fields": [{"name":"field name","value":"field value","inline":false}],',
      '  "footer": "short footer",',
      '  "color": 5793266',
      '}',
      'Keep summary concise and fields practical.',
    ].join('\n');

    const tools = buildToolDefinitions();
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    let rawFinalText = '';
    let structured = null;

    try {
      for (let i = 0; i < MAX_TOOL_ROUNDS; i += 1) {
        const data = await requestNvidiaChat({
          apiKey,
          messages,
          tools,
        });

        const choice = data?.choices?.[0]?.message;
        if (!choice) throw new Error('No response choices were returned by NVIDIA API.');

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
            const result = runTool(interaction, toolName, toolArgs);
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
        break;
      }
    } catch (error) {
      return interaction.editReply({
        embeds: [
          embeds.error(
            `NVIDIA AI request failed: ${truncate(error.message, 500)}`,
            interaction.guild ?? null,
          ),
        ],
      });
    }

    const embed = createAiEmbed(interaction, structured, rawFinalText);
    return interaction.editReply({ embeds: [embed] });
  },
};
