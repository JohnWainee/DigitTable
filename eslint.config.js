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
// client Firebase seams (apps/web/src/firebase/**, apps/web/src/repository/
// FirebaseRoomRepository.ts, apps/web/src/session/**, board tasks A01/A05), and the trusted
// Cloud Functions codebase (apps/functions/**, Admin SDK + firebase-functions) — never in the
// pure engine/contracts/templates packages or the rest of apps/web. `paths` catches the bare
// "firebase" specifier; `patterns` catches every "firebase/*"/"@firebase/*" subpath import too.
const FIREBASE_RESTRICTED_IMPORTS = [
  {
    name: "firebase",
    message:
      "Firebase belongs only in the emulator harness (packages/testing/src/emulator.ts) and the client's own Firebase/repository/session seams (apps/web/src/firebase/**, apps/web/src/repository/FirebaseRoomRepository.ts, apps/web/src/session/**) — not here.",
  },
  {
    name: "firebase-admin",
    message:
      "No Firebase Admin SDK outside apps/functions; privileged server code only runs inside the trusted Cloud Functions codebase (Phase 2 PR 3+).",
  },
];
const FIREBASE_RESTRICTED_PATTERNS = [
  {
    group: ["firebase/*", "@firebase/*"],
    message:
      "Firebase belongs only in the emulator harness (packages/testing/src/emulator.ts) and the client's own Firebase/repository/session seams (apps/web/src/firebase/**, apps/web/src/repository/FirebaseRoomRepository.ts, apps/web/src/session/**) — not here.",
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
      "scripts/**",
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
    // The sanctioned Firebase seam in packages/: the emulator test harness (Phase 2 PR 1) and
    // its rules tests. Firebase stays banned everywhere else in packages/ (the override above)
    // until a repository implementation needs it (Phase 2 PR 7).
    files: ["packages/testing/src/emulator.ts", "packages/testing/test-emulator/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: [THREE_RESTRICTED_IMPORT] }],
    },
  },
  {
    // The trusted Cloud Functions codebase (docs/ARCHITECTURE.md ADR-001): the only place the
    // Admin SDK and firebase-functions may be imported. Phase 2 PR 3 hosts the admission
    // callables here; PR 4 adds the gameplay command authority.
    files: ["apps/functions/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: [THREE_RESTRICTED_IMPORT] }],
    },
  },
  {
    // Board task A05: the client's remaining Firebase seams —
    // FirebaseRoomRepository (real callable/Firestore transport for game
    // commands) and FirebaseSessionClient (create/join/claim), alongside
    // PR 3's anonymous-auth bootstrap. Firebase stays banned everywhere
    // else in apps/web.
    files: [
      "apps/web/src/firebase/**/*.{ts,tsx}",
      "apps/web/src/repository/FirebaseRoomRepository.ts",
      "apps/web/src/session/**/*.{ts,tsx}",
      "apps/web/test-emulator/**/*.{ts,tsx}",
    ],
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
