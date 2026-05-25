// @ts-check
import { defineConfig } from "astro/config";
import path from "node:path";

import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  vite: {
    resolve: {
      alias: {
        "@": path.resolve("./src"),
        "@components": path.resolve("./src/components"),
        "@layouts": path.resolve("./src/layouts"),
        "@lib": path.resolve("./src/lib"),
        "@styles": path.resolve("./src/styles"),
      },
    },

    plugins: [tailwindcss()],
  },
  output: "static",
  integrations: [react()],
});