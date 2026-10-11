import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "/__apiMock/",
  resolve: {
    alias: {
      "@ui": fileURLToPath(new URL(".", import.meta.url)),
      "@catalog": fileURLToPath(new URL("../src/overrideCatalog.ts", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("../dist/ui", import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 4096,
    target: "es2022",
    rolldownOptions: {
      onwarn(warning, defaultHandler) {
        // This bundle runs entirely in the browser; React Server Component directives do not apply.
        if (warning.code === "MODULE_LEVEL_DIRECTIVE" && warning.message.includes("use client"))
          return;
        defaultHandler(warning);
      },
    },
  },
});
