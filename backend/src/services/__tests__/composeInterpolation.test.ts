import { describe, expect, it } from 'vitest';
import { interpolateComposeValue, parseComposeEnvironment } from '../composeInterpolation.js';

describe('Compose interpolation', () => {
  it('parses quoted, exported, and commented environment values', () => {
    expect(
      parseComposeEnvironment(`
        # ignored
        export VERSION="v1.2.3"
        CHANNEL=stable # deployment channel
        LITERAL='value # retained'
      `),
    ).toEqual({
      VERSION: 'v1.2.3',
      CHANNEL: 'stable',
      LITERAL: 'value # retained',
    });
  });

  it('resolves braced and unbraced variables', () => {
    const environment = { IMAGE: 'ghcr.io/example/app', VERSION: '1.2.3' };
    expect(interpolateComposeValue('${IMAGE}:$VERSION', environment)).toBe(
      'ghcr.io/example/app:1.2.3',
    );
  });

  it('implements unset and empty default semantics', () => {
    const environment = { EMPTY: '' };
    expect(interpolateComposeValue('${MISSING:-release}', environment)).toBe('release');
    expect(interpolateComposeValue('${EMPTY:-release}', environment)).toBe('release');
    expect(interpolateComposeValue('${EMPTY-release}', environment)).toBe('');
  });

  it('retains unresolved variables and escaped dollar signs', () => {
    expect(interpolateComposeValue('${MISSING}:$$TAG', {})).toBe('${MISSING}:$TAG');
  });
});
