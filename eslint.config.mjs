import tseslint from "typescript-eslint";

const BANNED_HTTP = ["axios", "node-fetch", "got", "undici", "request"];

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "extension/**", "out/**", "data/**", "next-env.d.ts"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Norma policy: all outbound HTTP goes through src/lib/net/politeFetch.ts
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Use politeFetch from src/lib/net/politeFetch.ts (Norma policy)." },
      ],
      "no-restricted-imports": [
        "error",
        { paths: BANNED_HTTP.map((name) => ({ name, message: "Banned by Norma policy: use politeFetch." })) },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // The one allowed server-side caller, plus browser code calling our own API.
  { files: ["src/lib/net/politeFetch.ts", "src/app/**/*.tsx"], rules: { "no-restricted-globals": "off" } },
);
