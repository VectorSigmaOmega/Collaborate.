/* global process */
const fs = require("node:fs");

const appRoot = process.env.COLLABORATE_APP_ROOT ?? "/home/ubuntu/collaborate-app";
const envFile = `${appRoot}/shared/api.env`;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

const appEnv = loadEnvFile(envFile);

module.exports = {
  apps: [
    {
      name: "collaborate-api",
      cwd: `${appRoot}/source`,
      script: "./apps/api/dist/index.js",
      env: {
        NODE_ENV: "production",
        ...appEnv
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 5
    }
  ]
};
