import * as React from "react";
import { defineResource, server, view } from "volt";

import { appendFeedItem, getFeedItems } from "../../data/state";

export const resource = defineResource("/resource/feed/:id", {
  component: function FeedPanelResource() {
    const view = resource.useView();
    const pending = resource.usePending();
    const [message, setMessage] = React.useState("");

    return (
      <section>
        <h2>Resource Action Example</h2>
        <resource.Form
          onSubmit={(event) => {
            const value = message.trim();

            if (!value) {
              event.preventDefault();
              return;
            }

            setMessage("");
          }}
        >
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="New feed item"
            name="message"
            disabled={pending}
          />
          <button type="submit" disabled={pending || message.trim().length === 0}>
            {pending ? "Adding..." : "Add feed item"}
          </button>
        </resource.Form>

        {view ? <React.Suspense fallback={<p>Loading feed...</p>}>{view}</React.Suspense> : null}
      </section>
    );
  },

  loader: server<unknown, any, "/resource/feed/:id">(async ({ params }) => {
    return view(<FeedList feedId={params.id} items={getFeedItems(params.id)} />);
  }),

  action: server<unknown, any, "/resource/feed/:id">(async ({ params, request }) => {
    const formData = await request.formData();
    const messageValue = formData.get("message");
    const message = typeof messageValue === "string" ? messageValue.trim() : "";

    const items = message ? appendFeedItem(params.id, message) : getFeedItems(params.id);
    return view(<FeedList feedId={params.id} items={items} />);
  }),
});

function FeedList(props: { feedId: string; items: Array<{ id: string; message: string }> }) {
  return (
    <div>
      <p>Feed id: {props.feedId}</p>
      <ul>
        {props.items.map((item) => (
          <li key={item.id}>{item.message}</li>
        ))}
      </ul>
    </div>
  );
}
