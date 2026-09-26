export type MobilePlatform = 'ios' | 'android';

export type UpdateDecision =
  | { kind: 'none' }
  | { kind: 'optional' | 'required'; latestBuild: number; storeUrl: string };

type PlatformPolicy = {
  enabled: boolean;
  latestBuild: number;
  minimumBuild: number;
  storeUrl: string;
};

const NO_UPDATE: UpdateDecision = { kind: 'none' };

export function shouldEnforceVersionPolicy(isDevelopment: boolean, channel: string | null, platform: string): boolean {
  return !isDevelopment && channel === 'production' && (platform === 'ios' || platform === 'android');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBuildNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isStoreUrl(value: unknown, platform: MobilePlatform): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const hosts = platform === 'ios' ? ['apps.apple.com', 'itunes.apple.com'] : ['play.google.com'];
    return url.protocol === 'https:' && hosts.includes(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function readPlatformPolicy(data: unknown, platform: MobilePlatform): PlatformPolicy | null {
  if (!isRecord(data) || !isRecord(data[platform])) return null;
  const policy = data[platform];
  if (policy.enabled === false) return null;
  if (policy.enabled !== true || !isBuildNumber(policy.latestBuild) ||
      !isBuildNumber(policy.minimumBuild) || policy.minimumBuild > policy.latestBuild ||
      !isStoreUrl(policy.storeUrl, platform)) return null;
  return policy as PlatformPolicy;
}

/** Invalid or unavailable policy always fails open. Compare native build numbers, not OTA versions. */
export function evaluateVersionPolicy(
  data: unknown,
  platform: MobilePlatform,
  installedBuild: string | null | undefined,
): UpdateDecision {
  if (typeof installedBuild !== 'string' || !/^\d+$/.test(installedBuild)) return NO_UPDATE;
  const build = Number(installedBuild);
  if (!Number.isSafeInteger(build)) return NO_UPDATE;
  const policy = readPlatformPolicy(data, platform);
  if (!policy || build >= policy.latestBuild) return NO_UPDATE;
  return {
    kind: build < policy.minimumBuild ? 'required' : 'optional',
    latestBuild: policy.latestBuild,
    storeUrl: policy.storeUrl,
  };
}

export async function fetchVersionDecision(
  url: string | undefined,
  platform: MobilePlatform,
  installedBuild: string | null | undefined,
  fetchPolicy: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<UpdateDecision> {
  if (!url || !/^https:\/\//i.test(url)) return NO_UPDATE;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchPolicy(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) return NO_UPDATE;
        return evaluateVersionPolicy(await response.json(), platform, installedBuild);
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error('Update policy timeout')); }, timeoutMs);
      }),
    ]);
  } catch {
    return NO_UPDATE;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
