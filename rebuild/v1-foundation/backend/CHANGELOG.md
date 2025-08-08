## PR5a - Auth: Atomic refresh sessions, JWT scaffolding

- Added atomic refresh rotation via Redis Lua with namespaces and sliding TTL
- Added JWT sign/verify with iss/aud/kid and ±60s leeway
- Added unit tests for rotate/reuse/concurrency/revoke-all
- CI env updated to run refresh tests with isolated AUTH_PREFIX


