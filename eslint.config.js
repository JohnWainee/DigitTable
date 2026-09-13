// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

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
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              message:
                "Phase 1A is engine-only. React does not belong in packages/ or templates/ yet.",
            },
            {
              name: "firebase",
              message:
                "Phase 1A is local-only. Firebase adapters land with the realtime milestone.",
            },
            {
              name: "three",
              message: "Three.js is deferred; not part of this platform's scope.",
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
