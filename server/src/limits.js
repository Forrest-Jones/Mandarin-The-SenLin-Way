// Plan limits and entitlement helpers.
import { nextDayUtc, nextMonthUtc, HttpError } from './util.js';

export const PLAN_LIMITS = {
  free: { aiMessagesPerDay: 25, aiTokensPerMonth: 60_000, ttsCharsPerMonth: 20_000, sttSecondsPerMonth: 600 },
  pro: { aiMessagesPerDay: 400, aiTokensPerMonth: 2_000_000, ttsCharsPerMonth: 500_000, sttSecondsPerMonth: 20_000 },
};

export const AI_RATE_PER_MINUTE = 20;

/** 'pro' only while not expired; anything else is 'free'. */
export function effectivePlan(user, now = Date.now()) {
  if (!user || user.plan !== 'pro') return 'free';
  if (user.plan_expires_at) {
    const t = Date.parse(user.plan_expires_at);
    if (Number.isFinite(t) && t <= now) return 'free';
  }
  return 'pro';
}

export function limitsFor(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export function limitError(which, resetAt) {
  return new HttpError(429, 'limit', { limit: which, resetAt: resetAt.toISOString() });
}

export const resetDaily = (now = new Date()) => nextDayUtc(now);
export const resetMonthly = (now = new Date()) => nextMonthUtc(now);
