import { mountApp } from "litzjs/client";
import { registerSW } from "virtual:pwa-register";

import { app } from "./app";
import { layout } from "./routes/_layouts/root";
import "./index.css";

const root = document.getElementById("app");

if (!root) {
  throw new Error('Missing "#app" root element.');
}

mountApp(root, { app, layout });
registerSW();
