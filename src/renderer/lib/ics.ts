import type { AppData, Subscription } from '../../shared/types';
import { renewalAnchor } from '../../shared/renewal-core';

const escapeText = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const compactDate = (iso: string): string => iso.replace(/-/g, '');

const nextDay = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const dtstamp = (now: Date): string => {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${now.getUTCFullYear()}` +
    `${pad(now.getUTCMonth() + 1)}` +
    `${pad(now.getUTCDate())}T` +
    `${pad(now.getUTCHours())}` +
    `${pad(now.getUTCMinutes())}` +
    `${pad(now.getUTCSeconds())}Z`
  );
};

/**
 * Day-of-month part matching the app's clamping (an anchor on the 31st
 * renews on the last day of shorter months). A plain FREQ=MONTHLY from the
 * 31st would, per RFC 5545, skip those months entirely. For day 29/30 the
 * candidates 28..day with BYSETPOS=-1 pick the anchor day, or the month's
 * last day when it is shorter.
 */
const monthDayRule = (day: number): string => {
  if (day === 31) return ';BYMONTHDAY=-1';
  if (day >= 29) {
    const days = Array.from({ length: day - 27 }, (_, i) => 28 + i).join(',');
    return `;BYMONTHDAY=${days};BYSETPOS=-1`;
  }
  return '';
};

export const rruleFor = (s: Subscription): string | null => {
  const anchor = renewalAnchor(s);
  const month = Number(anchor.slice(5, 7));
  const day = Number(anchor.slice(8, 10));
  switch (s.billingCycle) {
    case 'monthly':
      return `FREQ=MONTHLY${monthDayRule(day)}`;
    case 'quarterly':
      return `FREQ=MONTHLY;INTERVAL=3${monthDayRule(day)}`;
    case 'yearly':
      // Feb 29 anchors fall back to Feb 28 in non-leap years.
      return month === 2 && day === 29
        ? 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1'
        : 'FREQ=YEARLY';
    default:
      return null;
  }
};

/** Earliest reminder: the largest threshold (per-sub override, else global). */
const reminderDaysFor = (s: Subscription, globalDaysBefore: number[]): number | null => {
  const days = s.alertConfig?.daysBefore?.length ? s.alertConfig.daysBefore : globalDaysBefore;
  return days.length > 0 ? Math.max(...days) : null;
};

const buildEvent = (s: Subscription, reminderDays: number | null, now: Date): string[] => {
  const startDate = compactDate(s.renewalDate);
  const endDate = compactDate(nextDay(s.renewalDate));
  const lines = [
    'BEGIN:VEVENT',
    `UID:sub-${s.id}@tools-subs-manager`,
    `DTSTAMP:${dtstamp(now)}`,
    `DTSTART;VALUE=DATE:${startDate}`,
    `DTEND;VALUE=DATE:${endDate}`,
    `SUMMARY:${escapeText(`${s.name} renews — ${s.currency} ${s.cost.toFixed(2)}`)}`,
    `DESCRIPTION:${escapeText(`${s.billingCycle} subscription · next charge ${s.currency} ${s.cost.toFixed(2)}`)}`,
  ];
  const rrule = rruleFor(s);
  if (rrule) lines.push(`RRULE:${rrule}`);
  if (reminderDays !== null) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(`${s.name} renewal reminder`)}`,
      `TRIGGER:-P${Math.max(0, Math.floor(reminderDays))}D`,
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT');
  return lines;
};

export const buildIcs = (data: AppData, now: Date = new Date()): string => {
  const globalDaysBefore = data.preferences.notify.globalDaysBefore;
  const active = data.subscriptions.filter((s) => s.status === 'active');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tools & Subs Manager//EN',
    'CALSCALE:GREGORIAN',
  ];
  for (const s of active) {
    lines.push(...buildEvent(s, reminderDaysFor(s, globalDaysBefore), now));
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
};
