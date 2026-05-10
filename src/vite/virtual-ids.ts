// Virtual module IDs. Each pair has a bare ID (used in import statements) and a
// resolved ID prefixed with `\0`, the Vite convention for in-memory modules.
export const ROUTE_MANIFEST_ID = "virtual:litzjs:route-manifest";
export const RESOLVED_ROUTE_MANIFEST_ID = "\0virtual:litzjs:route-manifest";
export const RESOURCE_MANIFEST_ID = "virtual:litzjs:resource-manifest";
export const RESOLVED_RESOURCE_MANIFEST_ID = "\0virtual:litzjs:resource-manifest";
export const LITZ_RSC_ENTRY_ID = "virtual:litzjs:rsc-entry";
export const RESOLVED_LITZ_RSC_ENTRY_ID = "\0virtual:litzjs:rsc-entry";
export const LITZ_BROWSER_ENTRY_ID = "virtual:litzjs:browser-entry";
export const RESOLVED_LITZ_BROWSER_ENTRY_ID = "\0virtual:litzjs:browser-entry";
export const LITZ_RSC_RENDERER_ID = "virtual:litzjs:rsc-renderer";
export const RESOLVED_LITZ_RSC_RENDERER_ID = "\0virtual:litzjs:rsc-renderer";
