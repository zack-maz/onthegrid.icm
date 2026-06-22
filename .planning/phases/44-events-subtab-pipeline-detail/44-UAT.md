---
status: testing
phase: 44-events-subtab-pipeline-detail
source: [44-VERIFICATION.md]
started: 2026-06-10T16:20:00Z
updated: 2026-06-10T16:20:00Z
---

## Current Test

number: 1
name: Live prod events subtab renders mounted blocks with real Redis data
expected: |
On the live prod dashboard with a Bearer key, the Events subtab shows:
Waterfall/Histograms/CallLog/EvalScore/Dlq/Suspect rendering under a live
NIM-only run; BudgetBarsBlock absent (self-hidden — D-06, the correct
outcome); FlightRecorderBlock showing run history; DeadLinkBucketsBlock
showing the authoritative deadUrlCount, per-status buckets labeled
"of N scanned", and drill-down sample rows with evidence as literal text,
relativeTime, and dead-streak count (dead ×N).
awaiting: user response

## Tests

### 1. Live prod events subtab renders mounted blocks with real Redis data

expected: Waterfall/Histograms/CallLog/EvalScore/Dlq/Suspect render under a live NIM-only run; BudgetBarsBlock is absent (self-hidden — D-06, correct); FlightRecorderBlock shows run history; DeadLinkBucketsBlock shows authoritative deadUrlCount, "of N scanned" per-status buckets, and drill-down rows with evidence as text, relativeTime, and dead-streak count.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
