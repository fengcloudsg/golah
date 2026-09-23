import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

function resolvePath(root, value) {
  if (!value) return "";
  return isAbsolute(value) ? value : join(root, value);
}

export function loadTlsOptions(root) {
  const certPath = resolvePath(root, process.env.SSL_CERT_PATH);
  const keyPath = resolvePath(root, process.env.SSL_KEY_PATH);
  const caPath = resolvePath(root, process.env.SSL_CA_PATH);
  if (!certPath || !keyPath) {
    return { options: null, certPath, keyPath, error: "Set SSL_CERT_PATH and SSL_KEY_PATH" };
  }
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    return {
      options: null,
      certPath,
      keyPath,
      error: `Certificate files not found (${certPath}, ${keyPath})`,
    };
  }
  return {
    options: {
      cert: readFileSync(certPath),
      key: readFileSync(keyPath),
      ca: caPath && existsSync(caPath) ? readFileSync(caPath) : undefined,
    },
    certPath,
    keyPath,
    error: null,
  };
}
