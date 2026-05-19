import { readFileSync } from "node:fs";
import path from "node:path";

export function readDoc(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}
