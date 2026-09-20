#!/usr/bin/env node
/* Prints one day's 10-minute lesson as Markdown (what the daily push sends).
   Usage:
     node tools/lesson.js            → today's lesson (by calendar, from CONFIG.startDate)
     node tools/lesson.js 14         → day 14
     node tools/lesson.js 2026-10-01 → the lesson for that date
   Env:  SENLIN_SITE=https://…/  (link to include), SENLIN_START=YYYY-MM-DD   */
'use strict';
const S = require('../js/engine.js');
const start = process.env.SENLIN_START || S.CONFIG.startDate;
const site = process.env.SENLIN_SITE || 'https://forrest-jones.github.io/mandarin-the-senlin-way/';
const arg = process.argv[2];
let day;
if (!arg) day = S.dayNumber(new Date(), start);
else if (/^\d+$/.test(arg)) day = parseInt(arg, 10);
else day = S.dayNumber(S.parseISO(arg), start);

const days = S.buildSchedule();
if (day > days.length) {
  console.log(`# Mandarin The SenLin Way — Day ${day}\n\nYou have finished the scheduled curriculum (${days.length} days). Today: 10 minutes of review on the site, then shadow five sentences from the Library.\n\n${site}#/library`);
  process.exit(0);
}
const lesson = S.buildLesson(day, days, {}, null, Date.now());
const date = S.dateForDay(day, start);
console.log(S.lessonMarkdown(lesson, null, site).replace('*10 minutes*', `*10 minutes · ${S.isoDate(date)}*`));
