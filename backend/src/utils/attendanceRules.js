import { karachiClockParts } from './karachiTime.js';

// Ported 1:1 from frontend/src/utils/attendanceRules.js so both sides agree.
export const RULES = {
  freeOffsPerMonth: 2,
  lateCountForAutoOff: 4,
  lateCutoffHour: 16,
  lateCutoffMinute: 0,
};

export function computeAttendanceStatus({ lateCount = 0, offsTaken = 0 }) {
  const autoOffsFromLate = Math.floor(lateCount / RULES.lateCountForAutoOff);
  const effectiveOffs = offsTaken + autoOffsFromLate;
  const offsRemaining = Math.max(0, RULES.freeOffsPerMonth - effectiveOffs);
  const deduction = effectiveOffs > RULES.freeOffsPerMonth;
  const lateInCycle = lateCount % RULES.lateCountForAutoOff;
  const lateUntilAutoOff =
    lateInCycle === 0 ? RULES.lateCountForAutoOff : RULES.lateCountForAutoOff - lateInCycle;

  return {
    lateCount,
    offsTaken,
    autoOffsFromLate,
    effectiveOffs,
    offsRemaining,
    deduction,
    lateUntilAutoOff,
  };
}

/** Late if 4:00 PM Asia/Karachi or later */
export function isLateCheckIn(date = new Date()) {
  const p = karachiClockParts(date);
  return (
    p.hour > RULES.lateCutoffHour ||
    (p.hour === RULES.lateCutoffHour && p.minute >= RULES.lateCutoffMinute)
  );
}
