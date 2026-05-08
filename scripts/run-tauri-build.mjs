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
  const cargoConfigScriptPath = path.join(cacheDir, "write-cargo-config.mjs");
  fs.writeFileSync(
    cargoConfigScriptPath,
    [
      'import fs from "node:fs";',
      'import path from "node:path";',
      'const configDir = path.join(process.cwd(), "src-tauri", ".cargo");',
      'const configPath = path.join(configDir, "config.toml");',
      `const linkWrapperPath = ${JSON.stringify(path.join(cacheDir, "link-wrapper.cmd"))};`,
      `const buildEnvPath = ${JSON.stringify(path.join(cacheDir, "build-env.cmd"))};`,
      'const sdkVersion = normalizeVersion(process.env.WindowsSDKLibVersion || process.env.UCRTVersion || "");',
      'const ucrtVersion = normalizeVersion(process.env.UCRTVersion || process.env.WindowsSDKLibVersion || "");',
      'const sdkRoot = cleanEnvPath(process.env.WindowsSdkDir || "");',
      'const ucrtRoot = cleanEnvPath(process.env.UniversalCRTSdkDir || process.env.WindowsSdkDir || "");',
      'const netfxRoot = cleanEnvPath(process.env.NETFXSDKDir || "");',
      'const vcToolsInstallDir = cleanEnvPath(process.env.VCToolsInstallDir || "");',
      'const libPaths = uniquePaths([',
      '  ...splitLibPaths(process.env.LIB || ""),',
      '  netfxRoot ? path.join(netfxRoot, "lib", "um", "x64") : "",',
      '  ucrtRoot && ucrtVersion ? path.join(ucrtRoot, "lib", ucrtVersion, "ucrt", "x64") : "",',
      '  sdkRoot && sdkVersion ? path.join(sdkRoot, "lib", sdkVersion, "um", "x64") : "",',
      '  ...discoverWindowsKitLibPaths()',
      ']).filter((entry) => entry && fs.existsSync(entry));',
      'const includePaths = uniquePaths([',
      '  ...splitPathList(process.env.INCLUDE || ""),',
      '  vcToolsInstallDir ? path.join(vcToolsInstallDir, "include") : "",',
      '  sdkRoot && sdkVersion ? path.join(sdkRoot, "Include", sdkVersion, "um") : "",',
      '  sdkRoot && sdkVersion ? path.join(sdkRoot, "Include", sdkVersion, "shared") : "",',
      '  ucrtRoot && ucrtVersion ? path.join(ucrtRoot, "Include", ucrtVersion, "ucrt") : "",',
      '  sdkRoot && sdkVersion ? path.join(sdkRoot, "Include", sdkVersion, "winrt") : "",',
      '  sdkRoot && sdkVersion ? path.join(sdkRoot, "Include", sdkVersion, "cppwinrt") : "",',
      '  netfxRoot ? path.join(netfxRoot, "Include", "um") : "",',
      '  ...discoverWindowsKitIncludePaths()',
      ']).filter((entry) => entry && fs.existsSync(entry));',
      'const flags = libPaths.flatMap((entry) => ["-C", `link-arg=/LIBPATH:${entry}`]);',
      'const preferredLinker = vcToolsInstallDir',
      '  ? path.join(vcToolsInstallDir, "bin", "HostX64", "x64", "link.exe")',
      '  : "link.exe";',
      'const linker = fs.existsSync(preferredLinker) ? preferredLinker : "link.exe";',
      'const linkArgs = libPaths.map((entry) => winQuote(`/LIBPATH:${entry}`)).join(" ");',
      'fs.mkdirSync(configDir, { recursive: true });',
      'fs.writeFileSync(',
      '  linkWrapperPath,',
      '  ["@echo off", `${winQuote(linker)} %* ${linkArgs}`, "exit /b %errorlevel%", ""].join("\\r\\n"),',
      '  "utf8"',
      ');',
      'fs.writeFileSync(',
      '  buildEnvPath,',
      '  [',
      '    "@echo off",',
      '    `set "LIB=${libPaths.join(";")};%LIB%"`,',
      '    `set "LIBPATH=${libPaths.join(";")};%LIBPATH%"`,',
      '    `set "INCLUDE=${includePaths.join(";")};%INCLUDE%"`,',
      '    ""',
      '  ].join("\\r\\n"),',
      '  "utf8"',
      ');',
      'fs.writeFileSync(',
      '  configPath,',
      '  `[build]\\nrustflags = ${JSON.stringify(flags)}\\n\\n[target.x86_64-pc-windows-msvc]\\nlinker = ${JSON.stringify(linkWrapperPath)}\\n`,',
      '  "utf8"',
      ');',
      'function winQuote(value) {',
      '  return `"${String(value).replace(/"/g, \'""\')}"`;',
      '}',
      'function splitLibPaths(value) {',
      '  return splitPathList(value);',
      '}',
      'function splitPathList(value) {',
      '  return value.split(";").map(cleanEnvPath);',
      '}',
      'function cleanEnvPath(value) {',
      '  return String(value || "").trim();',
      '}',
      'function normalizeVersion(value) {',
      '  return String(value || "").trim().replace(/[\\\\/]+$/, "");',
      '}',
      'function uniquePaths(entries) {',
      '  const seen = new Set();',
      '  const result = [];',
      '  for (const entry of entries.map(cleanEnvPath).filter(Boolean)) {',
      '    const key = entry.toLowerCase();',
      '    if (!seen.has(key)) {',
      '      seen.add(key);',
      '      result.push(entry);',
      '    }',
      '  }',
      '  return result;',
      '}',
      'function discoverWindowsKitLibPaths() {',
      '  const kitLibRoot = "C:\\\\Program Files (x86)\\\\Windows Kits\\\\10\\\\lib";',
      '  const netfxLibRoot = "C:\\\\Program Files (x86)\\\\Windows Kits\\\\NETFXSDK";',
      '  const paths = [];',
      '  if (fs.existsSync(kitLibRoot)) {',
      '    const versions = fs',
      '      .readdirSync(kitLibRoot, { withFileTypes: true })',
      '      .filter((entry) => entry.isDirectory())',
      '      .map((entry) => entry.name)',
      '      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));',
      '    for (const version of versions) {',
      '      paths.push(path.join(kitLibRoot, version, "ucrt", "x64"));',
      '      paths.push(path.join(kitLibRoot, version, "um", "x64"));',
      '    }',
      '  }',
      '  if (fs.existsSync(netfxLibRoot)) {',
      '    const versions = fs',
      '      .readdirSync(netfxLibRoot, { withFileTypes: true })',
      '      .filter((entry) => entry.isDirectory())',
      '      .map((entry) => entry.name)',
      '      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));',
      '    for (const version of versions) {',
      '      paths.push(path.join(netfxLibRoot, version, "lib", "um", "x64"));',
      '    }',
      '  }',
      '  return paths;',
      '}',
      'function discoverWindowsKitIncludePaths() {',
      '  const kitIncludeRoot = "C:\\\\Program Files (x86)\\\\Windows Kits\\\\10\\\\Include";',
      '  const netfxRoot = "C:\\\\Program Files (x86)\\\\Windows Kits\\\\NETFXSDK";',
      '  const paths = [];',
      '  if (fs.existsSync(kitIncludeRoot)) {',
      '    const versions = fs',
      '      .readdirSync(kitIncludeRoot, { withFileTypes: true })',
      '      .filter((entry) => entry.isDirectory())',
      '      .map((entry) => entry.name)',
      '      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));',
      '    for (const version of versions) {',
      '      paths.push(path.join(kitIncludeRoot, version, "um"));',
      '      paths.push(path.join(kitIncludeRoot, version, "shared"));',
      '      paths.push(path.join(kitIncludeRoot, version, "ucrt"));',
      '      paths.push(path.join(kitIncludeRoot, version, "winrt"));',
      '      paths.push(path.join(kitIncludeRoot, version, "cppwinrt"));',
      '    }',
      '  }',
      '  if (fs.existsSync(netfxRoot)) {',
      '    const versions = fs',
      '      .readdirSync(netfxRoot, { withFileTypes: true })',
      '      .filter((entry) => entry.isDirectory())',
      '      .map((entry) => entry.name)',
      '      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));',
      '    for (const version of versions) {',
      '      paths.push(path.join(netfxRoot, version, "Include", "um"));',
      '    }',
      '  }',
      '  return paths;',
      '}',
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    commandPath,
    [
      "@echo off",
      "setlocal EnableDelayedExpansion",
      `call ${winQuote(devCmd)} -arch=x64 -host_arch=x64`,
      "if errorlevel 1 exit /b %errorlevel%",
      `set "PATH=${path.dirname(process.execPath)};${cargoBin};%PATH%"`,
      'set "CARGO_ENCODED_RUSTFLAGS="',
      'set "RUSTFLAGS="',
      `${winQuote(process.execPath)} ${winQuote(cargoConfigScriptPath)}`,
      "if errorlevel 1 exit /b %errorlevel%",
      `call ${winQuote(path.join(cacheDir, "build-env.cmd"))}`,
      "if errorlevel 1 exit /b %errorlevel%",
      `${winQuote(process.execPath)} ${winQuote(tauriCli)} build --no-bundle`,
      "set BUILD_EXIT=%errorlevel%",
      `if exist ${winQuote(path.join("src-tauri", ".cargo", "config.toml"))} del /q ${winQuote(path.join("src-tauri", ".cargo", "config.toml"))}`,
      "exit /b %BUILD_EXIT%",
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
