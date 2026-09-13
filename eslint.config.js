// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

const ENGINE_ONLY_RESTRICTED_IMPORTS = [
  {
    name: "react",
    message:
      "packages/ and templates/ stay framework-independent (AGENTS.md). React belongs in apps/web only.",
  },
];

const PLATFORM_WIDE_RESTRICTED_IMPORTS = [
  {
    name: "firebase",
    message: "No Firebase adapters before the realtime milestone (Phase 2).",
  },
  {
    name: "three",
    message: "Three.js is deferred; not part of this platform's scope.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      ".claude/**",
      "assets/**",
      "eslint.config.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "*.js",
            "*.ts",
            "packages/*/vitest.config.ts",
            "templates/*/vitest.config.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/explicit-function-return-type": ["warn", { allowExpressions: true }],
      "no-restricted-imports": ["error", { paths: PLATFORM_WIDE_RESTRICTED_IMPORTS }],
    },
  },
  {
    files: ["packages/**/*.ts", "templates/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [...PLATFORM_WIDE_RESTRICTED_IMPORTS, ...ENGINE_ONLY_RESTRICTED_IMPORTS] },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...reactHooks.configs["recommended-latest"].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  eslintConfigPrettier,
);
