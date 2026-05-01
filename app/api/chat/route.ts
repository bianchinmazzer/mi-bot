import { NextRequest, NextResponse } from 'next/server';
import { runConversation, ChatMessage, ConversationStats } from '@/lib/anthropic';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_MESSAGE_LENGTH = 2000;

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';

    const { ok } = checkRateLimit(ip);
    if (!ok) {
      return NextResponse.json(
        { error: 'Too many messages. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { message, history, stats } = body as {
      message: string;
      history: ChatMessage[];
      stats?: ConversationStats;
    };

    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Invalid message.' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_MESSAGE_LENGTH} chars).` },
        { status: 400 }
      );
    }

    const newHistory: ChatMessage[] = [
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: message },
    ];

    const result = await runConversation(newHistory, stats);

    return NextResponse.json({
      reply: result.reply,
      history: result.updatedHistory,
      stats: result.stats,
      ended: result.ended,
    });
  } catch (err) {
    console.error('[chat error]', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}