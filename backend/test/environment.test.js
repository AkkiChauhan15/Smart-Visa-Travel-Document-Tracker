import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inferDatabaseSsl } from '../src/config/env.js';

describe('provider-neutral database environment configuration', () => {
  it('accepts the standard Neon direct URL format and infers required TLS', () => {
    const neonUrl = new URL('postgresql://ep-example.ap-southeast-1.aws.neon.tech/neondb');
    neonUrl.username = 'test-role';
    neonUrl.password = 'test-password';
    neonUrl.searchParams.set('sslmode', 'require');
    neonUrl.searchParams.set('channel_binding', 'require');

    assert.equal(neonUrl.protocol, 'postgresql:');
    assert.equal(neonUrl.searchParams.get('channel_binding'), 'require');
    assert.equal(inferDatabaseSsl(neonUrl.href), true);
  });

  it('keeps plain local PostgreSQL TLS-disabled unless explicitly enabled', () => {
    assert.equal(inferDatabaseSsl('postgresql://user:password@127.0.0.1:5432/local'), false);
    assert.equal(
      inferDatabaseSsl('postgresql://user:password@127.0.0.1:5432/local?sslmode=disable'),
      false,
    );
  });
});
