import { defineConfig, devices } from "@playwright/test";

const PORTA = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    ...devices["Pixel 5"],
    browserName: "chromium",
    serviceWorkers: "allow",
  },
  webServer: {
    // Build de produção + API com os mocks servindo /pontos/.
    command: "pnpm run build && pnpm --filter @ecoponto/api start",
    url: `http://127.0.0.1:${PORTA}/pontos/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORTA), ECO_DEV_LOGIN: "1", NODE_ENV: "test" },
  },
});
