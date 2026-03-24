---
"litzjs": patch
---

Fetch route loaders in layout chains concurrently using `Promise.allSettled` instead of sequentially. For a chain of depth N, load time is now the max of all loader durations instead of the sum, eliminating the waterfall latency.
