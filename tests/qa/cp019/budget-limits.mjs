// Approved SC-012 changes SQL; SC-013 changes only cumulative artifacts.
// Case artifacts remain2000. All processes import the same pinned limits.
import limits from './budget-limits.json' with {type:'json'};
export const CASE_LIMITS=Object.freeze(limits.case);
export const GLOBAL_LIMITS=Object.freeze(limits.global);
export const CASE_SECONDS=limits.caseSeconds,COHORT_SECONDS=limits.cohortSeconds,SCENARIO_COUNT=limits.scenarioCount;
