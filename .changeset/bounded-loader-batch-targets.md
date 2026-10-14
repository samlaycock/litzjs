---
"litzjs": patch
---

Reject batched route loader requests whose `targets` contain duplicates, exceed the route's match chain, or include non-array/non-string values. These now return a safe `400` malformed-request fault before any middleware or loader runs, so one target executes at most once per batch in both the production server and the dev middleware.
