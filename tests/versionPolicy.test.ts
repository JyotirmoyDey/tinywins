import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateVersionPolicy, fetchVersionDecision, shouldEnforceVersionPolicy } from '../src/update/versionPolicy';

const policy = {
  ios: { enabled: true, latestBuild: 12, minimumBuild: 10, storeUrl: 'https://apps.apple.com/app/tinywins/id123' },
  android: { enabled: true, latestBuild: 22, minimumBuild: 20, storeUrl: 'https://play.google.com/store/apps/details?id=com.tinywins' },
};

test('enforcement runs only on production-channel iOS and Android builds', () => {
  assert.equal(shouldEnforceVersionPolicy(false, 'production', 'ios'), true);
  assert.equal(shouldEnforceVersionPolicy(false, 'production', 'android'), true);
  assert.equal(shouldEnforceVersionPolicy(true, 'production', 'ios'), false);
  assert.equal(shouldEnforceVersionPolicy(false, 'preview', 'ios'), false);
  assert.equal(shouldEnforceVersionPolicy(false, null, 'android'), false);
  assert.equal(shouldEnforceVersionPolicy(false, 'production', 'web'), false);
});

test('current and newer native builds continue normally', () => {
  assert.deepEqual(evaluateVersionPolicy(policy, 'ios', '12'), { kind: 'none' });
  assert.deepEqual(evaluateVersionPolicy(policy, 'android', '23'), { kind: 'none' });
});

test('optional update uses the selected platform store', () => {
  assert.deepEqual(evaluateVersionPolicy(policy, 'ios', '11'), {
    kind: 'optional', latestBuild: 12, storeUrl: policy.ios.storeUrl,
  });
  assert.deepEqual(evaluateVersionPolicy(policy, 'android', '21'), {
    kind: 'optional', latestBuild: 22, storeUrl: policy.android.storeUrl,
  });
});

test('below minimum build is mandatory, including a much older build', () => {
  assert.deepEqual(evaluateVersionPolicy(policy, 'ios', '9'), {
    kind: 'required', latestBuild: 12, storeUrl: policy.ios.storeUrl,
  });
  assert.equal(evaluateVersionPolicy(policy, 'android', '1').kind, 'required');
});

test('disabled updates and invalid configuration fail open', () => {
  assert.deepEqual(evaluateVersionPolicy({ ...policy, ios: { enabled: false } }, 'ios', '1'), { kind: 'none' });
  for (const invalid of [null, {}, { ios: { ...policy.ios, latestBuild: '12' } },
    { ios: { ...policy.ios, minimumBuild: 13 } },
    { ios: { ...policy.ios, storeUrl: 'http://apps.apple.com/app/1' } },
    { ios: { ...policy.ios, storeUrl: policy.android.storeUrl } }]) {
    assert.deepEqual(evaluateVersionPolicy(invalid, 'ios', '1'), { kind: 'none' });
  }
  assert.deepEqual(evaluateVersionPolicy(policy, 'ios', null), { kind: 'none' });
  assert.deepEqual(evaluateVersionPolicy(policy, 'ios', '1.2.3'), { kind: 'none' });
});

test('offline, HTTP failures and malformed JSON never block access', async () => {
  const url = 'https://example.com/version.json';
  const offline = () => Promise.reject(new Error('offline')) as Promise<Response>;
  const failed = () => Promise.resolve({ ok: false } as Response);
  const invalidJson = () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('bad JSON')) } as Response);
  for (const fetcher of [offline, failed, invalidJson]) {
    assert.deepEqual(await fetchVersionDecision(url, 'ios', '1', fetcher as typeof fetch), { kind: 'none' });
  }
});

test('fetched platform policy is evaluated from JSON', async () => {
  const fetcher = () => Promise.resolve({ ok: true, json: () => Promise.resolve(policy) } as Response);
  assert.equal((await fetchVersionDecision('https://example.com/version.json', 'android', '19', fetcher as typeof fetch)).kind, 'required');
});
