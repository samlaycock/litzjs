---
"litzjs": patch
---

Wire dev server AbortController to the HTTP request lifecycle so that handler signals abort when the client disconnects. Previously, resource, route, and API handlers received a disconnected AbortSignal that was never aborted, causing long-running handlers to continue executing after the client navigated away. The fix listens for the Node.js IncomingMessage `close` event and calls `controller.abort()`, matching the production server behavior that uses `request.signal`.
