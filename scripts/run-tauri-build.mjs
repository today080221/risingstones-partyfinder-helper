import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let env = { ...process.env };
const cargoBin = path.join(env.USERPROFILE || env.HOME || "", ".cargo", "bin");
const tauriCli = path.join(process.cwd(), "node_modules", "@tauri-apps", "cli", "tauri.js");
const tauriArgs = ["build", ...args];
const isPortableExeBuild = args.includes("--no-bundle");

if (cargoBin && fs.existsSync(cargoBin)) {
  env.PATH = `${cargoBin}${path.delimiter}${env.PATH || ""}`;
}

if (!canRun("cargo", ["--version"], env)) {
  throw new Error(
    [
      "Cargo was not found. Install Rust with rustup, or add ~/.cargo/bin to PATH.",
      "On this Windows machine the expected directory is:",
      cargoBin || "C:\\Users\\<User>\\.cargo\\bin"
    ].join("\n")
  );
}

if (process.platform === "win32") {
  const devCmd = findVsDevCmd(env);
  if (devCmd) {
    if (isPortableExeBuild) {
      const commandPath = writeWindowsPortableBuildCommand(devCmd);
      const cmdExe = env.ComSpec || path.join(env.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
      const result = spawnSync(cmdExe, ["/d", "/c", commandPath], {
        cwd: process.cwd(),
        env,
        stdio: "inherit"
      });
      if (result.error) {
        throw result.error;
      }
      process.exit(result.status ?? 1);
    }

    env = {
      ...env,
      ...captureVsBuildEnv(devCmd, env)
    };
    env.PATH = prependPathEntries(env.PATH, [path.dirname(process.execPath), cargoBin]);
    addMsvcLibPathRustFlags(env);
  }
}

if (isPortableExeBuild) {
  const npmCli = env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  runChecked(process.execPath, [npmCli, "run", "build"], env);
  const cargoArgs = ["build", "--release", "--manifest-path", path.join("src-tauri", "Cargo.toml")];
  runChecked("cargo", cargoArgs, env, {
    shell: process.platform === "win32"
  });
  process.exit(0);
}

const result = spawnSync(process.execPath, [tauriCli, ...tauriArgs], {
  cwd: process.cwd(),
  env,
  stdio: "inherit"
});
if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);

function canRun(command, commandArgs, commandEnv) {
  const result = spawnSync(command, commandArgs, {
    env: commandEnv,
    shell: process.platform === "win32",
    stdio: "ignore"
  });
  return result.status === 0;
}

function runChecked(command, commandArgs, commandEnv, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: commandEnv,
    stdio: "inherit",
    shell: Boolean(options.shell)
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function findVsDevCmd(commandEnv) {
  const vswhere = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe";
  if (!fs.existsSync(vswhere)) {
    return "";
  }

  const result = spawnSync(
    vswhere,
    [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property",
      "installationPath"
    ],
    { env: commandEnv, encoding: "utf8" }
  );
  const installPath = result.stdout.trim();
  if (!installPath) {
    return "";
  }

  const devCmd = path.join(installPath, "Common7", "Tools", "VsDevCmd.bat");
  return fs.existsSync(devCmd) ? devCmd : "";
}

function captureVsBuildEnv(devCmd, commandEnv) {
  const cacheDir = path.join(process.cwd(), ".cache", "tauri-build");
  fs.mkdirSync(cacheDir, { recursive: true });
  const commandPath = path.join(cacheDir, "capture-vs-env.cmd");
  const cmdExe = commandEnv.ComSpec || path.join(commandEnv.SystemRoot || "C:\\Windows", "System32", "cmd.exe");
  fs.writeFileSync(
    commandPath,
    [
      "@echo off",
      `call ${winQuote(devCmd)} -arch=x64 -host_arch=x64 >nul`,
      "if errorlevel 1 exit /b %errorlevel%",
      "set",
      ""
    ].join("\r\n"),
    "utf8"
  );

  const result = spawnSync(cmdExe, ["/d", "/c", commandPath], {
    cwd: process.cwd(),
    env: commandEnv,
    encoding: "utf8"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error("Visual Studio build environment initialization failed.");
  }

  return parseEnvironment(result.stdout);
}

function writeWindowsPortableBuildCommand(devCmd) {
  const cacheDir = path.join(process.cwd(), ".cache", "tauri-build");
  fs.mkdirSync(cacheDir, { recursive: true });
  const commandPath = path.join(cacheDir, "run-tauri-portable-build.cmd");
  const npmCli = env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  fs.writeFileSync(
    commandPath,
    [
      "@echo off",
      `call ${winQuote(devCmd)} -arch=x64 -host_arch=x64`,
      "if errorlevel 1 exit /b %errorlevel%",
      `set "PATH=${path.dirname(process.execPath)};${cargoBin};%PATH%"`,
      `${winQuote(process.execPath)} ${winQuote(npmCli)} run build`,
      "if errorlevel 1 exit /b %errorlevel%",
      `cargo build --release --manifest-path ${winQuote(path.join("src-tauri", "Cargo.toml"))}`,
      "exit /b %errorlevel%",
      ""
    ].join("\r\n"),
    "utf8"
  );
  return commandPath;
}

function parseEnvironment(text) {
  const parsed = {};
  for (const line of text.split(/\r?\n/)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    parsed[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
  }
  return parsed;
}

function prependPathEntries(currentPath, entries) {
  const existing = currentPath || "";
  const prefix = entries.filter(Boolean).filter((entry) => fs.existsSync(entry));
  return [...prefix, existing].join(path.delimiter);
}

function addMsvcLibPathRustFlags(commandEnv) {
  const libValue = commandEnv.LIB || commandEnv.Lib || "";
  const libPaths = libValue
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry && fs.existsSync(entry));
  if (!libPaths.length) {
    return;
  }

  const separator = "\x1f";
  const existing = commandEnv.CARGO_ENCODED_RUSTFLAGS
    ? commandEnv.CARGO_ENCODED_RUSTFLAGS.split(separator).filter(Boolean)
    : [];
  const linkArgs = libPaths.flatMap((entry) => ["-C", `link-arg=/LIBPATH:${entry}`]);
  commandEnv.CARGO_ENCODED_RUSTFLAGS = [...existing, ...linkArgs].join(separator);
}

function winQuote(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}
