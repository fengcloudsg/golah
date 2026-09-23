import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function resolvePath(value: string | undefined, cwd: string) {
  if (!value) return "";
  return isAbsolute(value) ? value : resolve(cwd, value);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const certPath = resolvePath(env.SSL_CERT_PATH, process.cwd());
  const keyPath = resolvePath(env.SSL_KEY_PATH, process.cwd());
  const https =
    certPath && keyPath && existsSync(certPath) && existsSync(keyPath)
      ? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
      : undefined;
  const port = https ? Number(env.HTTPS_PORT || 443) : 5174;

  return {
    plugins: [react()],
    server: {
      host: true,
      port,
      strictPort: true,
      allowedHosts: true,
      https,
      proxy: {
        "/api": "http://127.0.0.1:4174",
      },
    },
    preview: {
      host: true,
      port,
      strictPort: true,
      allowedHosts: true,
      https,
      proxy: {
        "/api": "http://127.0.0.1:4174",
      },
    },
  };
});
