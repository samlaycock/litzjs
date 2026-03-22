import { mountApp } from "volt/client";

import { Layout } from "./components/layout";

const root = document.getElementById("app");

if (!root) {
  throw new Error('Fixture root element "#app" was not found.');
}

mountApp(root, Layout);
