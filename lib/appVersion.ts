export function requiresUpdate(current: unknown, minimum: unknown): boolean {
  if (typeof current !== 'string' || typeof minimum !== 'string') return false;
  const valid = /^\d+\.\d+\.\d+$/;
  if (!valid.test(current.trim()) || !valid.test(minimum.trim())) return false;
  const installed = current.trim().split('.').map(Number);
  const required = minimum.trim().split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (installed[i] !== required[i]) return installed[i] < required[i];
  }
  return false;
}

export function updateStoreUrl(platform: string): string | null {
  if (platform === 'ios') return 'https://apps.apple.com/app/id6786357993';
  if (platform === 'android') return 'https://play.google.com/store/apps/details?id=com.strikefeed.myapp';
  return null;
}
