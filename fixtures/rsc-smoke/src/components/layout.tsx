import * as React from "react";
import { useMatches } from "volt";

import { resource as accountMenu } from "../resources/account-menu";

export function Layout({ children }: { children: React.ReactNode }) {
  const matches = useMatches();

  return (
    <div>
      <h1>Volt RSC Smoke</h1>
      <p>This is the shared layout for all routes.</p>
      <nav aria-label="Breadcrumbs">
        <ol>
          {matches.map((match) => (
            <li key={match.id}>{match.path}</li>
          ))}
        </ol>
      </nav>
      <React.Suspense fallback={<p>Loading packaged resource...</p>}>
        <accountMenu.Component params={{ id: "user-001" }} />
      </React.Suspense>
      {children}
    </div>
  );
}
