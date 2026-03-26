---
"litzjs": patch
---

Extract the duplicated client `sortRecord` helper into a shared module and cover it with a focused unit test. This keeps route cache key generation and resource cache key generation aligned without changing runtime behaviour.
