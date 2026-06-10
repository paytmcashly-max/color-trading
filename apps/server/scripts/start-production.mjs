import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const node = process.execPath;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const migrationScript = resolve(scriptDir, "apply-schema.mjs");
const serverEntry = resolve(scriptDir, "../dist/main.js");

await run(node, [migrationScript]);

const server = spawn(node, [serverEntry], {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("error", (error) => {
  console.error("Failed to start production server.", error);
  process.exit(1);
});

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Production startup command failed (${signal ?? `exit code ${code ?? "unknown"}`}): ${command} ${args.join(" ")}`,
        ),
      );
    });
  });
}
