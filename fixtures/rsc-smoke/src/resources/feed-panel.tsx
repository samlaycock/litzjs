import * as React from "react";
import { defineResource, server, view } from "volt";

import { appendFeedItem, getFeedItems } from "../data/state";

export const resource = defineResource("/resource/feed/:id", {
  component: function FeedPanelResource(props) {
    const loader = resource.useLoader(props);
    const action = resource.useAction(props);
    const [message, setMessage] = React.useState("");

    return (
      <section>
        <h2>Resource Action Example</h2>
        <div>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="New feed item"
          />
          <button
            type="button"
            onClick={async () => {
              const value = message.trim();

              if (!value) {
                return;
              }

              await action.submit({ message: value }, props);
              setMessage("");
            }}
          >
            Add feed item
          </button>
        </div>

        <React.Suspense fallback={<p>Loading feed...</p>}>{loader.render()}</React.Suspense>
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
