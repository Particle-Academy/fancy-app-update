import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", stack: "src/stack.tsx", cards: "src/cards.tsx" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // react-fancy is an optional peer, reached only from the `stack` and `cards` entries.
  external: ["react", "react-dom", "@particle-academy/react-fancy"],
  // Client component — mark so React Server Component frameworks treat it as a
  // client boundary.
  banner: { js: '"use client";' },
});
