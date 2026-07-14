import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/retirement-planner",
  server: {
    port: Number(process.env.PORT) || 5173,
  },
});
