// Shared with backend/src/utils/attendanceRules.js
export const RULES = {
  freeOffsPerMonth: 2,
  lateCountForAutoOff: 4,
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
