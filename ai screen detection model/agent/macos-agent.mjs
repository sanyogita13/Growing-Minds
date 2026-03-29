import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const server = args.get("--server") || "http://127.0.0.1:3000";
const token = args.get("--token");
const sessionIdArg = args.get("--session");

if (!token && !sessionIdArg) {
  console.error("Usage: npm run agent:macos -- --token <join_token> [--server http://127.0.0.1:3000]");
  console.error("   or: npm run agent:macos -- --session <session_id> [--server http://127.0.0.1:3000]");
  process.exit(1);
}

let session = null;
let previousSignature = "";
let lastHeartbeatAt = 0;

async function osascript(script) {
  const { stdout } = await execFileAsync("osascript", ["-e", script]);
  return stdout.trim();
}

async function getFrontmostApp() {
  return osascript('tell application "System Events" to get name of first application process whose frontmost is true');
}

async function getBrowserTab(appName) {
  try {
    if (appName === "Safari") {
      const output = await osascript(`
        tell application "Safari"
          if (count of windows) is 0 then return ""
          set currentUrl to URL of current tab of front window
          set currentTitle to name of front document
          return currentUrl & linefeed & currentTitle
        end tell
      `);
      const [tabUrl = "", tabTitle = ""] = output.split("\n");
      return { tabUrl, tabTitle };
    }

    if (["Google Chrome", "Microsoft Edge", "Brave Browser", "Arc"].includes(appName)) {
      const output = await osascript(`
        tell application "${appName}"
          if (count of windows) is 0 then return ""
          set currentUrl to URL of active tab of front window
          set currentTitle to title of active tab of front window
          return currentUrl & linefeed & currentTitle
        end tell
      `);
      const [tabUrl = "", tabTitle = ""] = output.split("\n");
      return { tabUrl, tabTitle };
    }
  } catch {
    return { tabUrl: "", tabTitle: "" };
  }

  return { tabUrl: "", tabTitle: "" };
}

async function resolveSession() {
  if (sessionIdArg) {
    session = { id: sessionIdArg };
    return;
  }

  const response = await fetch(`${server}/api/session?token=${encodeURIComponent(token)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Unable to resolve session");
  }
  session = payload;
}

async function postDesktopTelemetry(snapshot) {
  const response = await fetch(`${server}/api/desktop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snapshot),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Desktop telemetry failed: ${payload}`);
  }
}

async function sampleDesktop() {
  const frontmostApp = await getFrontmostApp();
  const { tabUrl, tabTitle } = await getBrowserTab(frontmostApp);

  return {
    sessionId: session.id,
    timestamp: new Date().toISOString(),
    frontmostApp,
    tabUrl,
    tabTitle,
  };
}

async function tick() {
  const snapshot = await sampleDesktop();
  const signature = `${snapshot.frontmostApp}|${snapshot.tabUrl}|${snapshot.tabTitle}`;
  const now = Date.now();

  if (signature !== previousSignature || now - lastHeartbeatAt > 2000) {
    await postDesktopTelemetry(snapshot);
    previousSignature = signature;
    lastHeartbeatAt = now;
    console.log(`[agent] ${snapshot.frontmostApp}${snapshot.tabUrl ? ` | ${snapshot.tabUrl}` : ""}`);
  }
}

async function main() {
  await resolveSession();
  console.log(`[agent] monitoring session ${session.id} via ${server}`);
  await tick();
  setInterval(() => {
    tick().catch((error) => console.error(`[agent] ${error.message}`));
  }, 700);
}

main().catch((error) => {
  console.error(`[agent] ${error.message}`);
  process.exit(1);
});
