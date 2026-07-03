import { defineConfig } from "vite";

// Tauri expects a fixed dev port and no clearing of the screen so its logs show.
export default defineConfig({
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: "es2020", outDir: "dist", emptyOutDir: true },
});
