import { mountApp } from "volt/client";

import { AppShell } from "./components/app-shell";

const root = document.getElementById("app");

if (!root) {
  throw new Error('Fixture root element "#app" was not found.');
}

mountApp(root, AppShell);
