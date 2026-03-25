export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  cacheHit?: boolean;
  timestamp?: string;
}

export function log(entry: LogEntry): void {
  const output = JSON.stringify({
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  });

  if (entry.level === 'error') {
    console.error(output);
  } else {
    console.log(output);
  }
}
