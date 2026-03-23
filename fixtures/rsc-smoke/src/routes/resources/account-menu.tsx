import { defineResource, server, view } from "litz";
import * as React from "react";

import { ClientCounter } from "../../components/client-counter";

export const resource = defineResource("/resource/account/:id", {
  component: function AccountMenuResource() {
    const view = resource.useView();

    if (!view) {
      return <p>Loading account menu...</p>;
    }

    return <React.Suspense fallback={<p>Loading account menu...</p>}>{view}</React.Suspense>;
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
