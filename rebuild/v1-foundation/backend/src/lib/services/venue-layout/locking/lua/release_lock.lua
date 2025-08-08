-- KEYS[1] = lock key
-- ARGV[1] = expected value "<version>:<sessionId>"

local current = redis.call('GET', KEYS[1])
if not current then return {0, 'MISSING'} end

if current ~= ARGV[1] then return {0, 'NOT_OWNER'} end

redis.call('DEL', KEYS[1])
return {1, 'OK'}


