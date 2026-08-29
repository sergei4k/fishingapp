export type CatchFormRequirements = {
  hasPhoto: boolean;
};

export const CATCH_FORM_STEP_COUNT = 2;

export type CatchFormReadiness = {
  ready: boolean;
  missing: Array<"photo">;
};

export function getCatchFormReadiness({ hasPhoto }: CatchFormRequirements): CatchFormReadiness {
  const missing: CatchFormReadiness["missing"] = hasPhoto ? [] : ["photo"];
  return { ready: missing.length === 0, missing };
}

export function canAdvanceCatchFormStep(step: number, requirements: CatchFormRequirements): boolean {
  return step !== 0 || getCatchFormReadiness(requirements).ready;
}

export function getResetCatchFormStep(): number {
  return 0;
}
