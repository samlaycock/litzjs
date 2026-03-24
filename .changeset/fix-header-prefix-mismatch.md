---
"litzjs": patch
---

Fix header name mismatch between server and client that broke RSC view status codes and revalidation targets. The client was reading `x-litz-status` and `x-litz-revalidate` headers instead of the correct `x-litzjs-status` and `x-litzjs-revalidate` set by the server.
