import type { PropsWithChildren } from "react";

import { mountApp } from "litzjs/client";

import { app } from "./app";
import { AppShell } from "./components/app-shell";

const root = document.getElementById("app");

if (!root) {
  throw new Error('Fixture root element "#app" was not found.');
}

function ClientLayout(props: PropsWithChildren) {
  return (
    <section data-fixture-client-layout="mounted">
      <a href="#main">Skip to smoke content</a>
      {props.children}
    </section>
  );
}

function ClientNotFound() {
  return (
    <main id="main">
      <h1>Client Fixture Not Found</h1>
    </main>
  );
}

mountApp(root, {
  app,
  component: AppShell,
  layout: {
    id: "fixture-client-layout",
    path: "/",
    component: ClientLayout,
  },
  notFound: ClientNotFound,
});
