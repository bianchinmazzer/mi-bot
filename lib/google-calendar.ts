import { google, calendar_v3 } from 'googleapis';

function getCalendarClient(): calendar_v3.Calendar {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

const TIMEZONE = process.env.GOOGLE_TIMEZONE ?? 'America/Argentina/Buenos_Aires';
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? 'primary';
const WORKING_HOUR_START = 9;  // 9 AM
const WORKING_HOUR_END = 18;   // 6 PM
const SLOT_DURATION_MINUTES = 30;

export interface FreeSlot {
  start: string; // ISO datetime
  end: string;   // ISO datetime
  display: string; // human readable
}

/**
 * Returns free 30-min slots within working hours between two dates.
 */
export async function getAvailableSlots(
  startDate: string,
  endDate: string
): Promise<FreeSlot[]> {
  const calendar = getCalendarClient();

  // Build time range in local timezone
  const timeMin = new Date(`${startDate}T00:00:00`);
  const timeMax = new Date(`${endDate}T23:59:59`);

  const fb = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: TIMEZONE,
      items: [{ id: CALENDAR_ID }],
    },
  });

  const busy = fb.data.calendars?.[CALENDAR_ID]?.busy ?? [];

  const slots: FreeSlot[] = [];
  const cursor = new Date(timeMin);

  while (cursor < timeMax && slots.length < 20) {
    const day = cursor.getDay();
    const isWeekend = day === 0 || day === 6;
    const hour = cursor.getHours();

    if (
      !isWeekend &&
      hour >= WORKING_HOUR_START &&
      hour < WORKING_HOUR_END &&
      cursor > new Date() // ignore past
    ) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + SLOT_DURATION_MINUTES * 60_000);

      const isBusy = busy.some((b) => {
        const bs = new Date(b.start ?? '');
        const be = new Date(b.end ?? '');
        return slotStart < be && slotEnd > bs;
      });

      if (!isBusy) {
        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          display: slotStart.toLocaleString('en-US', {
            timeZone: TIMEZONE,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }),
        });
      }
    }

    // Advance cursor 30 min
    cursor.setMinutes(cursor.getMinutes() + SLOT_DURATION_MINUTES);

    // Skip to next day's working start if past working hours
    if (cursor.getHours() >= WORKING_HOUR_END) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(WORKING_HOUR_START, 0, 0, 0);
    }
  }

  return slots;
}

/**
 * Creates an event with a Google Meet link and invites the attendee.
 */
export async function bookMeeting(params: {
  startTime: string; // ISO
  attendeeEmail: string;
  attendeeName: string;
  topic: string;
}): Promise<{ eventLink: string; meetLink: string | null; start: string }> {
  const calendar = getCalendarClient();

  const start = new Date(params.startTime);
  const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60_000);

  const ownerName = process.env.OWNER_NAME ?? 'Owner';
  const ownerEmail = process.env.OWNER_EMAIL;

  const summary = `Meeting: ${ownerName} ↔ ${params.attendeeName}`;
  const description = `Topic: ${params.topic}\n\nMeeting requested via portfolio chatbot.`;

  const requestId = `meet-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const event: calendar_v3.Schema$Event = {
    summary,
    description,
    start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
    attendees: [
      { email: params.attendeeEmail, displayName: params.attendeeName },
      ...(ownerEmail ? [{ email: ownerEmail, organizer: true }] : []),
    ],
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 10 },
      ],
    },
  };

  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: event,
    conferenceDataVersion: 1,
    sendUpdates: 'all',
  });

  return {
    eventLink: res.data.htmlLink ?? '',
    meetLink: res.data.hangoutLink ?? null,
    start: start.toISOString(),
  };
}