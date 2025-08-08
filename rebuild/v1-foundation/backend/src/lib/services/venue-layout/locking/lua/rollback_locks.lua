-- KEYS[1..N] = lock keys
-- ARGV[1..N] = expected values

local deleted = 0
for i = 1, #KEYS do
  local k = KEYS[i]
  local expected = ARGV[i]
  local current = redis.call('GET', k)
  if current and current == expected then
    redis.call('DEL', k)
    deleted = deleted + 1
  end
end
return deleted


