const counters: Record<string, number> = Object.create(null);

export function recordWebhookDuplicate(eventId: string) {
  counters['webhook_dupes_total'] = (counters['webhook_dupes_total'] || 0) + 1;
}

export function recordWebhookReplay(eventId: string, ageSeconds: number) {
  counters['webhook_replays_total'] = (counters['webhook_replays_total'] || 0) + 1;
}

export function getWebhookMetrics() {
  return { ...counters };
}

export function recordBadSignature() {
  counters['webhook_bad_sig_total'] = (counters['webhook_bad_sig_total'] || 0) + 1;
}

export function recordBadContentType(v: string) {
  counters['webhook_bad_content_type_total'] = (counters['webhook_bad_content_type_total'] || 0) + 1;
}

export function recordOversize(n: number) {
  counters['webhook_oversize_total'] = (counters['webhook_oversize_total'] || 0) + 1;
}

export function recordLivemodeMismatch() {
  counters['webhook_livemode_mismatch_total'] = (counters['webhook_livemode_mismatch_total'] || 0) + 1;
}


