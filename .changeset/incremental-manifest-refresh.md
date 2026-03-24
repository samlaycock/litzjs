---
"litzjs": patch
---

Optimize dev server manifest refresh to avoid re-reading all route files on every file change

Previously, every `.ts/.tsx` file change triggered a full re-discovery of all routes, layouts, resources, and API routes — running 4 glob operations and reading every matched file from disk. This caused noticeable dev server lag on projects with many route files.

Now the dev server:
- Filters changes by glob pattern first, skipping files that can't affect manifests (e.g., utility modules, components)
- Performs incremental single-file updates on `change` events, only re-reading the one file that changed
- Reserves full re-discovery for `add`/`unlink` events where new manifest entries may appear or old ones may be removed
- Debounces `add`/`unlink` events to batch rapid changes (e.g., during `git checkout`) into a single discovery pass
