import Anthropic from '@anthropic-ai/sdk';
import { tools, executeTool } from './tools';
import { buildSystemPrompt } from './prompts';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 800;
const MAX_TOOL_LOOPS = 5;
const MAX_HISTORY_MESSAGES = 30;

// --- Conversation budget ---
const SOFT_LIMIT_TOKENS = 8000;   // bot starts redirecting toward booking a meeting
const HARD_LIMIT_TOKENS = 12000;  // server forces conversation end

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: Anthropic.Messages.ContentBlock[] | string };

export type ConversationStats = {
  totalInputTokens: number;
  totalOutputTokens: number;
};

export type RunResult = {
  reply: string;
  updatedHistory: ChatMessage[];
  stats: ConversationStats;
  ended: boolean; // true when we hit the hard limit
};

const HARD_LIMIT_REPLY_EN = `I'd love to keep chatting, but to keep this bot affordable I have to wrap things up here. The best next step is a quick 30-minute call — feel free to ask me to schedule one in a fresh conversation, or reach me directly at ${process.env.OWNER_EMAIL ?? ''}.`;

const HARD_LIMIT_REPLY_ES = `Me encantaría seguir charlando, pero para mantener este bot funcionando tengo que cortar acá. El próximo paso ideal es una reunión de 30 minutos — podés pedirme que la agendemos en una conversación nueva, o escribirme directamente a ${process.env.OWNER_EMAIL ?? ''}.`;

// Heuristic: detect if conversation is in Spanish based on last user message
function detectLanguage(history: ChatMessage[]): 'es' | 'en' {
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  if (!lastUser || typeof lastUser.content !== 'string') return 'en';
  // Very rough heuristic: common Spanish words
  const spanish = /\b(hola|gracias|por favor|reunión|reunion|agendar|disponibilidad|trabajo|qué|cómo|cuándo|dónde|sí|también|puedo|querés|querer|hablás)\b/i;
  return spanish.test(lastUser.content) ? 'es' : 'en';
}

export async function runConversation(
  history: ChatMessage[],
  previousStats: ConversationStats = { totalInputTokens: 0, totalOutputTokens: 0 }
): Promise<RunResult> {
  // --- HARD LIMIT: refuse to call the API ---
  const totalSoFar = previousStats.totalInputTokens + previousStats.totalOutputTokens;
  if (totalSoFar >= HARD_LIMIT_TOKENS) {
    const lang = detectLanguage(history);
    return {
      reply: lang === 'es' ? HARD_LIMIT_REPLY_ES : HARD_LIMIT_REPLY_EN,
      updatedHistory: history,
      stats: previousStats,
      ended: true,
    };
  }

  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);

  const messages: Anthropic.Messages.MessageParam[] = trimmed.map((m) => ({
    role: m.role,
    content: m.content as string | Anthropic.Messages.ContentBlockParam[],
  }));

  // --- SOFT LIMIT: nudge the model to wrap up ---
  let systemPrompt = buildSystemPrompt();
  if (totalSoFar >= SOFT_LIMIT_TOKENS) {
    systemPrompt += `

# IMPORTANT — conversation length notice
This conversation has gotten long. Start gently steering the user toward scheduling a meeting (offer to call get_available_slots) or sharing my CV/email so we can continue the discussion outside this chat. Keep your replies very short (1–2 sentences). Do not start new long topics.`;
  }

  const stats: ConversationStats = { ...previousStats };
  let loops = 0;

  while (loops < MAX_TOOL_LOOPS) {
    loops++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools,
      messages,
    });

    // Track usage
    stats.totalInputTokens += response.usage.input_tokens ?? 0;
    stats.totalOutputTokens += response.usage.output_tokens ?? 0;

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use'
      );

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (tu) => {
          const result = await executeTool(
            tu.name,
            tu.input as Record<string, unknown>
          );
          return {
            type: 'tool_result' as const,
            tool_use_id: tu.id,
            content: result,
          };
        })
      );

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text'
    );
    const reply = textBlock?.text ?? '(no response)';

    const updatedHistory: ChatMessage[] = [
      ...trimmed,
      { role: 'assistant', content: response.content },
    ];

    return { reply, updatedHistory, stats, ended: false };
  }

  return {
    reply: "Sorry, I had trouble processing that. Could you try rephrasing?",
    updatedHistory: trimmed,
    stats,
    ended: false,
  };
}