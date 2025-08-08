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


