export type CatchFormRequirements = {
  hasPhoto: boolean;
};

export const CATCH_FORM_STEP_COUNT = 3;

/** Photos, catch details, then the rod and reel used. */
export const CATCH_FORM_TACKLE_STEP = 2;

export type CatchFormReadiness = {
  ready: boolean;
  missing: Array<"photo">;
};

export function getCatchFormReadiness(_requirements: CatchFormRequirements): CatchFormReadiness {
  return { ready: true, missing: [] };
}

export function canMakeCatchPublic(_requirements: CatchFormRequirements): boolean {
  return true;
}

export function canAdvanceCatchFormStep(_step: number, _requirements: CatchFormRequirements): boolean {
  return true;
}

export function getResetCatchFormStep(): number {
  return 0;
}
