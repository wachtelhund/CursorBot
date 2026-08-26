import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const nodeOutput = {
  format: "cjs" as const,
  entryFileNames: "[name].js",
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: nodeOutput,
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: nodeOutput,
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
