import Anthropic from '@anthropic-ai/sdk';
import { getAvailableSlots, bookMeeting } from './google-calendar';

export const tools: Anthropic.Messages.Tool[] = [
  {
    name: 'get_available_slots',
    description:
      "Returns Matias's free 30-minute meeting slots within a date range. Use this whenever the user asks about availability or wants to schedule a meeting. Slots are within working hours (Mon-Fri, 9am-6pm local time).",
    input_schema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format (inclusive).',
        },
        end_date: {
          type: 'string',
          description:
            'End date in YYYY-MM-DD format (inclusive). Must be the same as or after start_date. Keep ranges short (1-7 days).',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
  name: 'send_cv',
  description:
    "Provides the user with a download link to Matias's CV (PDF). Call this when the user asks for the CV, resume, currículum, or anything similar. The CV contains the same information you already know, formatted as a printable document.",
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
},
  {
    name: 'book_meeting',
    description:
      'Books a 30-minute meeting on Matias\'s calendar with a Google Meet link and sends an invite to the attendee. Only call this AFTER confirming start_time, attendee_name, attendee_email, and topic with the user.',
    input_schema: {
      type: 'object',
      properties: {
        start_time: {
          type: 'string',
          description:
            'ISO 8601 datetime of the meeting start. Must match one of the slots returned by get_available_slots.',
        },
        attendee_name: {
          type: 'string',
          description: "Full name of the person booking the meeting.",
        },
        attendee_email: {
          type: 'string',
          description: 'Email address where the calendar invite will be sent.',
        },
        topic: {
          type: 'string',
          description: 'Short description of what the meeting is about.',
        },
      },
      required: ['start_time', 'attendee_name', 'attendee_email', 'topic'],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    if (name === 'get_available_slots') {
      const { start_date, end_date } = input as {
        start_date: string;
        end_date: string;
      };
      const slots = await getAvailableSlots(start_date, end_date);
      if (slots.length === 0) {
        return JSON.stringify({
          slots: [],
          message: 'No free slots in that range. Try a different range.',
        });
      }
      return JSON.stringify({
        slots: slots.map((s) => ({ start: s.start, display: s.display })),
      });
    }
    if (name === 'send_cv') {
      const url = '/cv/matias-bianchin-mazzer-cv.pdf';
      return JSON.stringify({
        success: true,
        cv_url: url,
        instruction: `Reply to the user with EXACTLY this markdown link: [Download my CV](${url}). Do NOT use any other URL. Do NOT mention S3, AWS, Google Drive, or any external hosting.`,
      });
    }

    if (name === 'book_meeting') {
      const { start_time, attendee_name, attendee_email, topic } = input as {
        start_time: string;
        attendee_name: string;
        attendee_email: string;
        topic: string;
      };

      // Email sanity check
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendee_email)) {
        return JSON.stringify({
          success: false,
          error: 'Invalid email format. Ask the user to confirm their email.',
        });
      }

      const result = await bookMeeting({
        startTime: start_time,
        attendeeEmail: attendee_email,
        attendeeName: attendee_name,
        topic,
      });

      return JSON.stringify({
        success: true,
        meet_link: result.meetLink,
        event_link: result.eventLink,
        start: result.start,
        message:
          'Meeting booked successfully. The attendee will receive a calendar invite by email with the Meet link.',
      });
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (err) {
    console.error(`[tool error: ${name}]`, err);
    return JSON.stringify({
      error: 'Tool execution failed. Tell the user to try again later or contact me directly.',
    });
  }
}