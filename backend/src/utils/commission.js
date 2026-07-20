// Commission rules.
//
// Two rates can apply to a deal:
//   1. The agent's (or manager's) own cut — user_commission_rates
//   2. The manager's cut on that specific agent — manager_agent_rates
//
// Both are stored per month so changing May never rewrites April.

export const COMMISSION_RULES = {
  maxPercentage: 100,
  maxCombinedPercentage: 100,
};

/** Round to 2dp without float drift (0.1 + 0.2 style). */
export function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** A percentage is valid if it is a number in [0, 100] with <= 2 decimals. */
export function isValidPercentage(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  if (n < 0 || n > COMMISSION_RULES.maxPercentage) return false;
  return money(n) === n;
}

/**
 * Validation shared by write paths that touch both rates.
 * Returns an array of human-readable errors — empty means valid.
 */
export function validateRates({ agentPercentage, managerPercentage }) {
  const errors = [];

  if (agentPercentage !== undefined && !isValidPercentage(agentPercentage)) {
    errors.push('Commission must be a number between 0 and 100 with at most 2 decimals');
  }
  if (managerPercentage !== undefined && !isValidPercentage(managerPercentage)) {
    errors.push("The manager's cut must be a number between 0 and 100 with at most 2 decimals");
  }

  if (errors.length === 0) {
    const combined = money(Number(agentPercentage || 0) + Number(managerPercentage || 0));
    if (combined > COMMISSION_RULES.maxCombinedPercentage) {
      errors.push(
        `Their cut plus the manager's cut is ${combined}%, which exceeds ${COMMISSION_RULES.maxCombinedPercentage}% of the revenue`
      );
    }
  }

  return errors;
}
