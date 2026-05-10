declare module "virtual:litzjs:route-manifest" {
  export const routeManifest: Array<{
    id: string;
    path: string;
    load: () => Promise<{
      route?: {
        id: string;
        path: string;
        component: import("react").ComponentType;
        options?: {
          loader?: unknown;
          action?: unknown;
          errorBoundary?: import("react").ComponentType<{ error: unknown }>;
        };
      };
    }>;
  }>;
}

declare module "virtual:litzjs:resource-manifest" {
  export const resourceManifest: Array<{
    path: string;
    modulePath: string;
    hasLoader: boolean;
    hasAction: boolean;
    hasComponent: boolean;
  }>;
}
