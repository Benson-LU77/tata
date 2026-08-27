import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The pure city layer must stay network-free: it is the foundation of the
    // offline build, server-side validation, and the sunset promise.
    files: ["app/lib/city/**"],
    ignores: ["app/lib/city/metrics.ts"], // the one impure adapter, by design
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/obsidian", "**/obsidian.*"], message: "app/lib/city is a pure layer — no network modules." },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "app/lib/city is a pure layer — no network calls." },
        { name: "XMLHttpRequest", message: "app/lib/city is a pure layer — no network calls." },
        { name: "WebSocket", message: "app/lib/city is a pure layer — no network calls." },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**", // agent worktrees carry their own dist output
    "dist/**",
    "dist-web/**",
  ]),
]);

export default eslintConfig;
