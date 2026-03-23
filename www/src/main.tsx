import { mountApp } from "litzjs/client";

import { layout } from "./routes/_layouts/root";
import "./index.css";

const root = document.getElementById("app");

if (!root) {
  throw new Error('Missing "#app" root element.');
}

mountApp(root, { layout });
