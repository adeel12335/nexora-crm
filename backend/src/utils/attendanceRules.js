// Ported 1:1 from frontend/src/utils/attendanceRules.js so both sides agree.
export const RULES = {
  freeOffsPerMonth: 2,
  lateCountForAutoOff: 4,
  lateCutoffHour: 9,
  lateCutoffMinute: 15,
};

export function computeAttendanceStatus({ lateCount = 0, offsTaken = 0 }) {
  const autoOffsFromLate = Math.floor(lateCount / RULES.lateCountForAutoOff);
  const effectiveOffs = offsTaken + autoOffsFromLate;
  const offsRemaining = Math.max(0, RULES.freeOffsPerMonth - effectiveOffs);
  const deduction = effectiveOffs > RULES.freeOffsPerMonth;
  const lateInCycle = lateCount % RULES.lateCountForAutoOff;
  const lateUntilAutoOff = lateInCycle === 0 ? RULES.lateCountForAutoOff : RULES.lateCountForAutoOff - lateInCycle;

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

export function isLateCheckIn(date) {
  return (
    date.getHours() > RULES.lateCutoffHour ||
    (date.getHours() === RULES.lateCutoffHour && date.getMinutes() > RULES.lateCutoffMinute)
  );
}
