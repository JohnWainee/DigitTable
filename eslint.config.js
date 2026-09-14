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

const THREE_RESTRICTED_IMPORT = {
  name: "three",
  message: "Three.js is deferred; not part of this platform's scope.",
};

// Phase 2 has begun (docs/PHASE_2_PLAN.md): Firebase packages are now allowed, but only in the
// emulator harness (packages/testing/src/emulator.ts, packages/testing/test-emulator/**), the
// Phase 2 PR 3 anonymous-auth seam (apps/web/src/firebase/**), and from Phase 2 PR 7,
// FirebaseRoomRepository — never in the pure engine/contracts/templates packages or the rest
// of apps/web. `paths` catches the bare "firebase" specifier; `patterns` catches every
// "firebase/*"/"@firebase/*" subpath import too.
const FIREBASE_RESTRICTED_IMPORTS = [
  {
    name: "firebase",
    message:
      "Firebase belongs only in the emulator harness (packages/testing/src/emulator.ts) and a future FirebaseRoomRepository — not here.",
  },
  {
    name: "firebase-admin",
    message:
      "No Firebase Admin SDK; privileged server code only runs inside a trusted Cloud Function (Phase 2 PR 4+).",
  },
];
const FIREBASE_RESTRICTED_PATTERNS = [
  {
    group: ["firebase/*", "@firebase/*"],
    message:
      "Firebase belongs only in the emulator harness (packages/testing/src/emulator.ts) and a future FirebaseRoomRepository — not here.",
  },
];

const PLATFORM_WIDE_RESTRICTED_IMPORTS = [...FIREBASE_RESTRICTED_IMPORTS, THREE_RESTRICTED_IMPORT];

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
        { paths: PLATFORM_WIDE_RESTRICTED_IMPORTS, patterns: FIREBASE_RESTRICTED_PATTERNS },
      ],
    },
  },
  {
    files: ["packages/**/*.ts", "templates/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...PLATFORM_WIDE_RESTRICTED_IMPORTS, ...ENGINE_ONLY_RESTRICTED_IMPORTS],
          patterns: FIREBASE_RESTRICTED_PATTERNS,
        },
      ],
    },
  },
  {
    // The one sanctioned Firebase seam so far (Phase 2 PR 1): the emulator test harness. Firebase
    // stays banned everywhere else in packages/ (the override above) until a repository
    // implementation needs it (Phase 2 PR 7).
    files: ["packages/testing/src/emulator.ts", "packages/testing/test-emulator/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: [THREE_RESTRICTED_IMPORT] }],
    },
  },
  {
    // PR 3's anonymous-auth bootstrap is the only browser Firebase seam before
    // FirebaseRoomRepository arrives in PR 7.
    files: ["apps/web/src/firebase/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { paths: [THREE_RESTRICTED_IMPORT] }],
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
