# Project Agent Rules

## Harness Maintenance

- Before substantial work, inspect the current git state and update or create a `docs/worklog/*.md` entry with the goal, baseline, risks, and expected validation.
- When the plan changes during implementation, immediately update the relevant worklog and feature documentation. Do not defer plan-change documentation to the end of the task.
- Before finishing a work phase, update the worklog with implementation summary, validation results, remaining risks, and suggested next steps.
- Keep `docs/README.md` linked to new worklogs or feature documents created during the task.
- Before PR/merge handoff, record `git fetch origin` / branch state and final QA results in the active worklog. Include `npm run validate:nga-parser`; if Tauri config, icons, bundle resources, or Rust command code changed, also include `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and `npm run desktop:build:portable`.

## Safety

- Do not request, read, export, log, or display Cookie, token, localStorage, sessionStorage, passwords, or other account/session material.
- NGA background reading must only use publicly accessible page content and must not reuse WebView profile state.
- NGA default reading must remain the user-visible WebView path. Public-page quick read is disabled and must not be exposed as a UI entry, frontend invoke path, or Tauri command.
- If a site restriction, permission page, CAPTCHA, or unsupported NGA page appears, mark it unsupported/blocked and return to a user-visible reading path.
