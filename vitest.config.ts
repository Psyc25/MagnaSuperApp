import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Logika tanggal bisnis memakai WIB; jalankan tes dengan zona UTC
    // (sama seperti server Vercel) supaya bug zona waktu ketahuan.
    env: { TZ: "UTC" },
  },
});
