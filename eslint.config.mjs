import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "client/src/components/ui/**", // shadcn-generated, not linted
    ],
  },

  // TypeScript base rules for all TS/TSX files
  ...tseslint.configs.recommended,

  // React hooks for client code
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Allow explicit `any` in a few known-necessary places (override per-file if needed)
      "@typescript-eslint/no-explicit-any": "warn",
      // Unused vars: error except for args prefixed with _
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  // Server-side TS
  {
    files: ["server/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
