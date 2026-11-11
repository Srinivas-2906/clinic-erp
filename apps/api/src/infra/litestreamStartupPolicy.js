/**
 * Pure helpers for Litestream restore fail-closed behavior in docker-entrypoint.
 */

export function litestreamReplicaRequiredFromEnv(env = process.env) {
  if (env.CLINIC_REQUIRE_LITESTREAM_REPLICA === '0') return false;
  if (env.CLINIC_REQUIRE_LITESTREAM_REPLICA === '1') return true;
  return Boolean(env.LITESTREAM_BUCKET) && env.NODE_ENV === 'production';
}
