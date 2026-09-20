#!/usr/bin/env node
/* Generates daily.ics — a calendar feed with one 10-minute event per lesson
   day at 07:00 local time, each linking straight to that day's lesson.
   Run: node tools/ics.js                                                    */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('../js/engine.js');
const site = process.env.SENLIN_SITE || 'https://forrest-jones.github.io/mandarin-the-senlin-way/';
const start = process.env.SENLIN_START || S.CONFIG.startDate;
const days = S.buildSchedule();
const pad = n => String(n).padStart(2, '0');
const stamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mandarin The SenLin Way//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mandarin The SenLin Way'];
for (const d of days) {
  const date = S.dateForDay(d.day, start);
  const what = d.type === 'pron' ? d.pron.title : d.chars.map(c => c.h).join(' ') + (d.words.length ? ' · ' + d.words.map(w => w.w).join(' ') : '');
  lines.push('BEGIN:VEVENT',
    `UID:senlin-day-${d.day}@senlin`,
    `DTSTAMP:${stamp(new Date(start))}T000000Z`,
    `DTSTART:${stamp(date)}T070000`,
    `DTEND:${stamp(date)}T071000`,
    `SUMMARY:森 Day ${d.day}: ${what}`.replace(/,/g, '\\,'),
    `DESCRIPTION:10-minute lesson. ${d.phase}. Open: ${site}#/lesson/${d.day}`.replace(/,/g, '\\,'),
    `URL:${site}#/lesson/${d.day}`,
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Plant today’s tree — 10 minutes of Mandarin', 'END:VALARM',
    'END:VEVENT');
}
lines.push('END:VCALENDAR');
fs.writeFileSync(path.join(__dirname, '..', 'daily.ics'), lines.join('\r\n') + '\r\n');
console.log(`daily.ics written: ${days.length} events from ${start}`);
