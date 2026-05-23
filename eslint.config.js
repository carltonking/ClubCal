import globals from "globals";

export default [
  {
    ignores: ["dist/", "supabase/.temp/", ".claude/"]
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-undef": "error",
      "no-duplicate-imports": "warn",
      "no-console": "off",
      "prefer-const": "warn",
      "no-var": "warn",
      eqeqeq: ["warn", "smart"]
    }
  }
];
