// Mock business rules for the attendance module. Final formula will be
// confirmed against payroll policy when the backend is implemented.
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

// Deterministic mock day-by-day calendar for the "my attendance" view.
export function buildMonthStatuses({ lateCount = 0, offsTaken = 0, upToDay, totalDays }) {
  const statuses = new Array(totalDays).fill('present');
  let lateLeft = lateCount;
  let offLeft = offsTaken;

  for (let day = totalDays; day >= 1; day -= 3) {
    if (lateLeft <= 0 && offLeft <= 0) break;
    if (day > upToDay) continue;
    if (offLeft > 0) {
      statuses[day - 1] = 'off';
      offLeft--;
    } else if (lateLeft > 0) {
      statuses[day - 1] = 'late';
      lateLeft--;
    }
  }

  for (let day = upToDay + 1; day <= totalDays; day++) {
    statuses[day - 1] = 'future';
  }

  return statuses;
}
