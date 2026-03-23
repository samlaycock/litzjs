import { useMatches } from "litzjs";
import * as React from "react";

import { resource as accountMenu } from "../routes/resources/account-menu";

export function AppShell({ children }: { children: React.ReactNode }) {
  const matches = useMatches();

  return (
    <div>
      <h1>Litz RSC Smoke</h1>
      <p>This is the shared app shell for all routes.</p>
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
