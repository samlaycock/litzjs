import * as React from "react";
import { defineResource, server, view } from "volt";

import { ClientCounter } from "../components/client-counter";

export const resource = defineResource("/resource/account/:id", {
  component: function AccountMenuResource(props) {
    const result = resource.useLoader(props);

    return (
      <React.Suspense fallback={<p>Loading account menu...</p>}>{result.render()}</React.Suspense>
    );
  },

  loader: server<unknown, any, "/resource/account/:id">(async ({ params }) => {
    return view(<AccountMenuView accountId={params.id} />);
  }),
});

function AccountMenuView(props: { accountId: string }) {
  return (
    <section>
      <h2>Account Menu</h2>
      <p>Active account: {props.accountId}</p>
      <ClientCounter label={`Clicks for ${props.accountId}`} />
    </section>
  );
}
