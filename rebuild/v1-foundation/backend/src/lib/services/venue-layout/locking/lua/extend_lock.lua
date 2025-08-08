-- KEYS[1] = lock key
-- ARGV[1] = expected value "<version>:<sessionId>"
-- ARGV[2] = new TTL in ms
-- ARGV[3] = max TTL in ms

local current = redis.call('GET', KEYS[1])
if not current then return {0, 'MISSING'} end

if current ~= ARGV[1] then return {0, 'NOT_OWNER'} end

-- validate value schema
if not string.match(current, '^(%d+):([%w%-]+)$') then
  return {0, 'BAD_VALUE'}
end

local ttl = tonumber(ARGV[2])
local max_ttl = tonumber(ARGV[3])
if ttl == nil or max_ttl == nil then return {0, 'BAD_TTL'} end
if ttl <= 0 or ttl > max_ttl then return {0, 'TTL_EXCEEDED'} end

redis.call('PEXPIRE', KEYS[1], ttl)
return {1, 'OK'}


