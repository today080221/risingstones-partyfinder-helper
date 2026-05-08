#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Utc;
use reqwest::header::{ACCEPT, ACCEPT_ENCODING, ORIGIN, REFERER, USER_AGENT};
use serde_json::{json, Map, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::Path,
    process::{Command, Stdio},
    time::Duration,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const OFFICIAL_API_HOME: &str = "https://apiff14risingstones.web.sdo.com/api/home/";
const OFFICIAL_ORIGIN: &str = "https://ff14risingstones.web.sdo.com";
const OFFICIAL_REFERER: &str = "https://ff14risingstones.web.sdo.com/pc/index.html#/recruit/party";
const OFFICIAL_SOURCE_REPO: &str = "today080221/risingstones-partyfinder-helper";
const PAGE_SIZE: usize = 100;
const PAGE_DELAY_MS: u64 = 180;
const MAX_PAGES: usize = 80;
const UPDATE_DOWNLOAD_RETRIES: usize = 3;
const UPDATE_DOWNLOAD_TIMEOUT_SECS: u64 = 600;

#[tauri::command]
async fn risingstones_version() -> Result<Value, String> {
    Ok(json!({
        "name": "risingstones-partyfinder-helper",
        "version": env!("CARGO_PKG_VERSION"),
        "builtAt": option_env!("BUILD_TIME").unwrap_or(""),
        "portable": false,
        "runtime": "desktop",
        "platform": format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
    }))
}

#[tauri::command]
async fn risingstones_meta() -> Result<Value, String> {
    let fb_configs = fetch_official("recruit/getFbConfigList", Vec::new()).await?;
    let labels = fetch_official("recruit/fbLabelList", Vec::new()).await?;
    let areas = fetch_official("groupAndRole/getAreaAndGroupList", Vec::new()).await?;
    let job_config = fetch_official("recruit/getJobConfigList", Vec::new()).await?;
    let job_meta = normalize_job_meta(&job_config);

    Ok(json!({
        "fbConfigs": fb_configs,
        "labels": labels,
        "areas": areas,
        "jobConfig": job_config,
        "jobMeta": job_meta,
        "fetchedAt": now_iso()
    }))
}

#[tauri::command]
async fn risingstones_recruits(query: BTreeMap<String, String>) -> Result<Value, String> {
    let fb_name = query.get("fb_name").map(|value| value.trim()).unwrap_or("");
    if fb_name.is_empty() {
        return Err("必须先选择副本名称，才允许全量拉取招募。".to_string());
    }

    let first_page = fetch_recruit_page(&query, 1).await?;
    let count = read_count(&first_page);
    let mut rows = read_rows(&first_page);
    let mut warnings: Vec<String> = Vec::new();

    for page in 2..=MAX_PAGES {
        if rows.len() >= count {
            break;
        }
        tokio::time::sleep(Duration::from_millis(PAGE_DELAY_MS)).await;
        let next_page = fetch_recruit_page(&query, page).await?;
        let next_rows = read_rows(&next_page);
        if next_rows.is_empty() {
            warnings.push(format!("第 {page} 页为空，已提前停止拉取。"));
            break;
        }
        rows.extend(next_rows);
    }

    if rows.len() < count {
        warnings.push(format!(
            "官方 count={count}，本次实际拉取 {} 条。",
            rows.len()
        ));
    }

    Ok(json!({
        "count": count,
        "fetched": rows.len(),
        "rows": rows,
        "query": map_to_json(&query),
        "pageSize": PAGE_SIZE,
        "fetchedAt": now_iso(),
        "warnings": warnings
    }))
}

#[tauri::command]
async fn risingstones_recruit_detail(id: u64) -> Result<Value, String> {
    fetch_official(
        "recruit/getRecruitFbDetail",
        vec![("id".to_string(), id.to_string())],
    )
    .await
}

#[tauri::command]
async fn risingstones_geoip() -> Result<Value, String> {
    let endpoints = [
        ("ipwho.is", "https://ipwho.is/", "country_code", "country"),
        (
            "ipapi.co",
            "https://ipapi.co/json/",
            "country_code",
            "country_name",
        ),
    ];
    let mut errors: Vec<String> = Vec::new();

    for (name, url, country_code_key, country_name_key) in endpoints {
        match fetch_json_url(url).await {
            Ok(json) => {
                let country_code = read_string(&json, country_code_key).to_uppercase();
                let country_name = read_string(&json, country_name_key);
                if country_code.is_empty() {
                    errors.push(format!("{name}: empty country code"));
                    continue;
                }
                return Ok(json!({
                    "countryCode": country_code,
                    "countryName": country_name,
                    "recommendedProvider": recommend_update_provider(&country_code),
                    "source": name,
                    "fallback": false,
                    "fetchedAt": now_iso()
                }));
            }
            Err(error) => errors.push(format!("{name}: {error}")),
        }
    }

    Ok(json!({
        "countryCode": "",
        "countryName": "",
        "recommendedProvider": fallback_update_provider(),
        "source": "fallback",
        "fallback": true,
        "fetchedAt": now_iso(),
        "message": if errors.is_empty() { "GeoIP 检测失败".to_string() } else { errors.join("; ") }
    }))
}

#[tauri::command]
async fn risingstones_check_update(provider: String) -> Result<Value, String> {
    let provider = provider.trim().to_lowercase();
    if provider != "github" && provider != "gitee" {
        return Err("更新源只支持 github 或 gitee。".to_string());
    }

    let repo = update_repo(&provider);
    if repo.is_empty() {
        return Err(format!("{} 尚未配置发布源。", provider_label(&provider)));
    }

    let release = fetch_latest_release(&provider, &repo).await?;
    let latest_version = read_string(&release, "tagName");
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    Ok(json!({
        "provider": provider,
        "sourceLabel": provider_label(&provider),
        "currentVersion": current_version,
        "latestVersion": latest_version,
        "latestName": read_string(&release, "name"),
        "latestUrl": read_string(&release, "htmlUrl"),
        "publishedAt": read_string(&release, "publishedAt"),
        "body": read_string(&release, "body"),
        "assets": release.get("assets").cloned().unwrap_or_else(|| json!([])),
        "isNewer": is_version_newer(&latest_version, env!("CARGO_PKG_VERSION")),
        "fetchedAt": now_iso()
    }))
}

#[tauri::command]
async fn risingstones_install_update(
    asset_name: String,
    download_url: String,
) -> Result<Value, String> {
    if std::env::consts::OS != "windows" {
        return Err("当前一键更新仅支持 Windows 桌面便携版。".to_string());
    }

    validate_update_asset(&asset_name, &download_url, "desktop")?;
    let executable_path =
        std::env::current_exe().map_err(|error| format!("读取当前程序路径失败：{error}"))?;
    let app_root = executable_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "读取当前程序目录失败。".to_string())?;
    if !app_root.join("release-manifest.json").exists() {
        return Err("当前目录没有 release-manifest.json，无法确认桌面便携包根目录。".to_string());
    }

    let update_dir =
        std::env::temp_dir().join(format!("risingstones-update-{}", std::process::id()));
    let zip_path = update_dir.join(sanitize_file_name(&asset_name));
    let extract_dir = update_dir.join("extract");
    let script_path = update_dir.join("apply-update.ps1");
    let log_path = update_dir.join("apply-update.log");

    let _ = fs::remove_dir_all(&update_dir);
    fs::create_dir_all(&update_dir).map_err(|error| format!("创建更新临时目录失败：{error}"))?;
    download_update_file(&download_url, &zip_path).await?;
    seed_update_log(&log_path, "update script prepared")
        .map_err(|error| format!("写入更新日志失败：{error}"))?;
    write_powershell_script(
        &script_path,
        &create_self_update_script(
            std::process::id(),
            &zip_path,
            &extract_dir,
            &app_root,
            &executable_path,
            &log_path,
        ),
    )
    .map_err(|error| format!("写入更新脚本失败：{error}"))?;
    start_powershell_script(&script_path)?;

    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(1500));
        std::process::exit(0);
    });

    Ok(json!({
        "message": format!("更新包已下载，程序即将退出并自动重启新版。若没有自动重启，可查看日志：{}", log_path.display()),
        "restart": true,
        "assetName": asset_name
    }))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            risingstones_version,
            risingstones_meta,
            risingstones_recruits,
            risingstones_recruit_detail,
            risingstones_geoip,
            risingstones_check_update,
            risingstones_install_update
        ])
        .run(tauri::generate_context!())
        .expect("failed to run RisingStones desktop app");
}

async fn download_update_file(download_url: &str, destination: &Path) -> Result<(), String> {
    let mut last_error = String::new();
    for attempt in 1..=UPDATE_DOWNLOAD_RETRIES {
        match download_update_file_once(download_url, destination).await {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error;
                if attempt < UPDATE_DOWNLOAD_RETRIES {
                    tokio::time::sleep(Duration::from_millis(800 * attempt as u64)).await;
                }
            }
        }
    }
    Err(last_error)
}

async fn download_update_file_once(download_url: &str, destination: &Path) -> Result<(), String> {
    let response = update_download_client(download_url)?
        .get(download_url)
        .header(USER_AGENT, "risingstones-partyfinder-helper-updater")
        .header(ACCEPT, "application/octet-stream, application/zip, */*")
        .header(ACCEPT_ENCODING, "identity")
        .send()
        .await
        .map_err(|error| {
            if is_github_update_url(download_url) {
                format!("更新包下载失败：{error}；GitHub 下载已尝试使用当前系统代理设置。")
            } else {
                format!("更新包下载失败：{error}")
            }
        })?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("更新包下载失败：HTTP {}", status.as_u16()));
    }
    let bytes = response.bytes().await.map_err(|error| {
        if is_github_update_url(download_url) {
            format!("更新包读取失败：{error}；GitHub 下载已尝试使用当前系统代理设置。")
        } else {
            format!("更新包读取失败：{error}")
        }
    })?;
    if bytes.len() < 1024 {
        return Err("更新包内容异常，文件过小。".to_string());
    }
    fs::write(destination, bytes).map_err(|error| format!("保存更新包失败：{error}"))
}

fn update_download_client(download_url: &str) -> Result<reqwest::Client, String> {
    let builder =
        reqwest::Client::builder().timeout(Duration::from_secs(UPDATE_DOWNLOAD_TIMEOUT_SECS));
    let builder = if is_github_update_url(download_url) {
        builder
    } else {
        builder.no_proxy()
    };
    builder
        .build()
        .map_err(|error| format!("更新下载客户端初始化失败：{error}"))
}

fn validate_update_asset(
    asset_name: &str,
    download_url: &str,
    runtime: &str,
) -> Result<(), String> {
    let lower_name = asset_name.to_ascii_lowercase();
    if !lower_name.ends_with(".zip") || !lower_name.starts_with("risingstones-partyfinder-helper-v")
    {
        return Err("只允许安装本项目 Release 中的 zip 更新包。".to_string());
    }
    if runtime == "desktop" && !lower_name.contains("desktop-win-x64-portable") {
        return Err("当前客户端只能安装桌面便携版更新包。".to_string());
    }
    if runtime == "portable"
        && (!lower_name.contains("-win-x64.zip") || lower_name.contains("desktop"))
    {
        return Err("当前客户端只能安装 Node 便携版 win-x64 更新包。".to_string());
    }
    if !is_trusted_update_url(download_url) {
        return Err("更新包下载地址不在受信任的发布源内。".to_string());
    }
    Ok(())
}

fn is_trusted_update_url(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    if url.scheme() != "https" {
        return false;
    }
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    host == "github.com"
        || host.ends_with(".github.com")
        || host == "gitee.com"
        || host.ends_with(".gitee.com")
}

fn is_github_update_url(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    host == "github.com" || host.ends_with(".github.com")
}

fn create_self_update_script(
    process_id: u32,
    zip_path: &Path,
    extract_dir: &Path,
    app_root: &Path,
    executable_path: &Path,
    log_path: &Path,
) -> String {
    format!(
        r#"$ErrorActionPreference = 'Stop'
$processId = {process_id}
$zipPath = {zip_path}
$extractDir = {extract_dir}
$appRoot = {app_root}
$executablePath = {executable_path}
$logPath = {log_path}

function Write-UpdateLog([string]$message) {{
  $line = ('{{0:O}} {{1}}' -f (Get-Date), $message)
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}}

try {{
  Write-UpdateLog 'update script started'
  try {{
    Wait-Process -Id $processId -Timeout 60 -ErrorAction SilentlyContinue
    Write-UpdateLog ('waited for process ' + $processId)
  }} catch {{
    Write-UpdateLog ('wait process skipped: ' + $_.Exception.Message)
  }}
  Start-Sleep -Milliseconds 700
  if (Test-Path -LiteralPath $extractDir) {{ Remove-Item -LiteralPath $extractDir -Recurse -Force }}
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
  Write-UpdateLog 'zip extracted'
  $payloadDir = $extractDir
  $items = @(Get-ChildItem -LiteralPath $extractDir -Force)
  if ($items.Count -eq 1 -and $items[0].PSIsContainer -and (Test-Path -LiteralPath (Join-Path $items[0].FullName 'release-manifest.json'))) {{
    $payloadDir = $items[0].FullName
  }}
  if (!(Test-Path -LiteralPath (Join-Path $payloadDir 'release-manifest.json'))) {{
    throw '更新包缺少 release-manifest.json，已取消覆盖。'
  }}
  for ($attempt = 1; $attempt -le 8; $attempt++) {{
    try {{
      Get-ChildItem -LiteralPath $payloadDir -Force | ForEach-Object {{
        Copy-Item -LiteralPath $_.FullName -Destination $appRoot -Recurse -Force
      }}
      Write-UpdateLog ('copy completed on attempt ' + $attempt)
      break
    }} catch {{
      Write-UpdateLog ('copy failed on attempt ' + $attempt + ': ' + $_.Exception.Message)
      if ($attempt -eq 8) {{ throw }}
      Start-Sleep -Milliseconds 800
    }}
  }}
  Start-Process -FilePath $executablePath -WorkingDirectory $appRoot
  Write-UpdateLog 'restarted application'
}} catch {{
  Write-UpdateLog ('update failed: ' + $_.Exception.Message)
  throw
}}
"#,
        process_id = process_id,
        zip_path = ps_quote_path(zip_path),
        extract_dir = ps_quote_path(extract_dir),
        app_root = ps_quote_path(app_root),
        executable_path = ps_quote_path(executable_path),
        log_path = ps_quote_path(log_path)
    )
}

fn start_powershell_script(script_path: &Path) -> Result<(), String> {
    let script = script_path.to_string_lossy().into_owned();
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass"])
        .arg("-File")
        .arg(script)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        command.creation_flags(0x08000000);
    }
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("启动更新脚本失败：{error}"))
}

fn write_powershell_script(script_path: &Path, script: &str) -> Result<(), String> {
    let mut bytes = Vec::with_capacity(script.len() + 3);
    bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    bytes.extend_from_slice(script.as_bytes());
    fs::write(script_path, bytes).map_err(|error| format!("写入更新脚本失败：{error}"))
}

fn seed_update_log(log_path: &Path, message: &str) -> Result<(), std::io::Error> {
    fs::write(log_path, format!("{} {}\r\n", now_iso(), message))
}

fn sanitize_file_name(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | '-') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn ps_quote_path(value: &Path) -> String {
    let text = value.to_string_lossy();
    format!("'{}'", text.replace('\'', "''"))
}

async fn fetch_recruit_page(
    query: &BTreeMap<String, String>,
    page: usize,
) -> Result<Value, String> {
    let mut params = vec![
        ("page".to_string(), page.to_string()),
        ("limit".to_string(), PAGE_SIZE.to_string()),
    ];
    for (key, value) in query {
        let value = value.trim();
        if !value.is_empty() {
            params.push((key.clone(), value.to_string()));
        }
    }
    fetch_official("recruit/recruitFbList", params).await
}

async fn fetch_official(path: &str, params: Vec<(String, String)>) -> Result<Value, String> {
    let client = http_client()?;
    let mut last_error = String::new();

    for attempt in 0..3 {
        match fetch_official_once(&client, path, &params).await {
            Ok(value) => return Ok(value),
            Err(error) => {
                last_error = error;
                if attempt < 2 {
                    tokio::time::sleep(Duration::from_millis(300 * (attempt + 1) as u64)).await;
                }
            }
        }
    }

    Err(last_error)
}

async fn fetch_official_once(
    client: &reqwest::Client,
    path: &str,
    params: &[(String, String)],
) -> Result<Value, String> {
    let url = format!("{OFFICIAL_API_HOME}{path}");
    let response = client
        .get(url)
        .query(params)
        .header(ACCEPT, "application/json, text/plain, */*")
        .header(ORIGIN, OFFICIAL_ORIGIN)
        .header(REFERER, OFFICIAL_REFERER)
        .header(
            USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        )
        .send()
        .await
        .map_err(|error| format!("官方接口请求失败：{error}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("官方接口响应读取失败：{error}"))?;
    if !status.is_success() {
        return Err(format!("官方接口 HTTP {}", status.as_u16()));
    }

    let json: Value =
        serde_json::from_str(&text).map_err(|error| format!("官方接口 JSON 解析失败：{error}"))?;
    let code = read_code(&json);
    if code != 10000 && code != 0 {
        let message = read_string(&json, "msg");
        return Err(if message.is_empty() {
            format!("官方接口返回异常 code={code}")
        } else {
            message
        });
    }
    json.get("data")
        .cloned()
        .ok_or_else(|| "官方接口没有返回 data。".to_string())
}

async fn fetch_latest_release(provider: &str, repo: &str) -> Result<Value, String> {
    let url = if provider == "github" {
        format!("https://api.github.com/repos/{repo}/releases/latest")
    } else {
        format!("https://gitee.com/api/v5/repos/{repo}/releases/latest")
    };

    match fetch_json_url(&url).await {
        Ok(json) => {
            let tag_name = read_string(&json, "tag_name");
            if tag_name.is_empty() {
                return Err("发布源没有返回有效版本号。".to_string());
            }
            Ok(json!({
                "tagName": tag_name,
                "name": read_string(&json, "name"),
                "htmlUrl": read_string(&json, "html_url"),
                "publishedAt": fallback_string(&json, "published_at", "created_at"),
                "body": read_string(&json, "body"),
                "assets": normalize_release_assets(json.get("assets").or_else(|| json.get("attach_files")))
            }))
        }
        Err(_) => fetch_latest_tag(provider, repo).await,
    }
}

async fn fetch_latest_tag(provider: &str, repo: &str) -> Result<Value, String> {
    let url = if provider == "github" {
        format!("https://api.github.com/repos/{repo}/tags?per_page=1")
    } else {
        format!("https://gitee.com/api/v5/repos/{repo}/tags?page=1&per_page=1")
    };
    let tags = fetch_json_url(&url).await?;
    let first = tags
        .as_array()
        .and_then(|values| values.first())
        .cloned()
        .unwrap_or(Value::Null);
    let tag_name = read_string(&first, "name");
    if tag_name.is_empty() {
        return Err("发布源没有 Release，也没有可用标签。".to_string());
    }

    let html_url = if provider == "github" {
        format!("https://github.com/{repo}/releases/tag/{tag_name}")
    } else {
        format!("https://gitee.com/{repo}/releases/tag/{tag_name}")
    };
    let download_url = if provider == "github" {
        format!("https://github.com/{repo}/archive/refs/tags/{tag_name}.zip")
    } else {
        format!("https://gitee.com/{repo}/repository/archive/{tag_name}.zip")
    };

    Ok(json!({
        "tagName": tag_name,
        "name": tag_name,
        "htmlUrl": html_url,
        "publishedAt": "",
        "body": "未找到正式 Release，已使用最新 Git tag 作为版本参考。",
        "assets": [{
            "name": format!("{tag_name}-source.zip"),
            "downloadUrl": download_url
        }]
    }))
}

async fn fetch_json_url(url: &str) -> Result<Value, String> {
    let client = http_client()?;
    let response = client
        .get(url)
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "RisingStones PartyFinder Helper")
        .send()
        .await
        .map_err(|error| format!("网络请求失败：{error}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("响应读取失败：{error}"))?;
    if !status.is_success() {
        return Err(format!(
            "HTTP {}: {}",
            status.as_u16(),
            text.chars().take(180).collect::<String>()
        ));
    }
    serde_json::from_str(&text).map_err(|error| format!("JSON 解析失败：{error}"))
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|error| format!("HTTP 客户端初始化失败：{error}"))
}

fn normalize_job_meta(job_config: &Value) -> Value {
    let categories = value_as_array(job_config.get("职能分类"));
    let mut jobs: Vec<Value> = Vec::new();
    let mut jobs_by_id = Map::new();
    let mut child_ids_by_category_id = Map::new();

    if let Some(object) = job_config.as_object() {
        for value in object.values() {
            for job in value_as_array(Some(value)) {
                if let Some(id) = job.get("id").and_then(Value::as_str) {
                    jobs_by_id.insert(id.to_string(), job.clone());
                }
                jobs.push(job);
            }
        }

        for category in &categories {
            let Some(category_id) = category.get("id").and_then(Value::as_str) else {
                continue;
            };
            let category_name = category.get("value").and_then(Value::as_str).unwrap_or("");
            let child_ids: Vec<Value> = object
                .get(category_name)
                .map(|value| {
                    value_as_array(Some(value))
                        .iter()
                        .filter_map(|job| job.get("id").and_then(Value::as_str))
                        .map(|id| json!(id))
                        .collect()
                })
                .unwrap_or_default();
            child_ids_by_category_id.insert(category_id.to_string(), Value::Array(child_ids));
        }

        if let Some(attack) = categories
            .iter()
            .find(|category| category.get("value").and_then(Value::as_str) == Some("进攻职业"))
        {
            if let Some(attack_id) = attack.get("id").and_then(Value::as_str) {
                let mut attack_children: Vec<Value> = Vec::new();
                for name in ["近战职业", "远程物理职业", "远程魔法职业"] {
                    for job in value_as_array(object.get(name)) {
                        if let Some(id) = job.get("id").and_then(Value::as_str) {
                            attack_children.push(json!(id));
                        }
                    }
                }
                child_ids_by_category_id
                    .insert(attack_id.to_string(), Value::Array(attack_children));
            }
        }
    }

    json!({
        "jobs": jobs,
        "jobsById": jobs_by_id,
        "childIdsByCategoryId": child_ids_by_category_id
    })
}

fn normalize_release_assets(value: Option<&Value>) -> Value {
    let Some(Value::Array(values)) = value else {
        return json!([]);
    };
    let assets: Vec<Value> = values
        .iter()
        .filter_map(|asset| {
            let name = read_string(asset, "name");
            let download_url = fallback_string(asset, "browser_download_url", "download_url");
            if name.is_empty() || download_url.is_empty() {
                return None;
            }
            let mut normalized = Map::new();
            normalized.insert("name".to_string(), json!(name));
            normalized.insert("downloadUrl".to_string(), json!(download_url));
            if let Some(size) = asset.get("size").and_then(Value::as_u64) {
                normalized.insert("size".to_string(), json!(size));
            }
            Some(Value::Object(normalized))
        })
        .collect();
    Value::Array(assets)
}

fn value_as_array(value: Option<&Value>) -> Vec<Value> {
    match value {
        Some(Value::Array(values)) => values.clone(),
        Some(Value::Object(_)) => vec![value.cloned().unwrap_or(Value::Null)],
        _ => Vec::new(),
    }
}

fn read_rows(page: &Value) -> Vec<Value> {
    page.get("rows")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn read_count(page: &Value) -> usize {
    match page.get("count") {
        Some(Value::Number(value)) => value.as_u64().unwrap_or(0) as usize,
        Some(Value::String(value)) => value.parse::<usize>().unwrap_or(0),
        _ => 0,
    }
}

fn read_code(value: &Value) -> i64 {
    for key in ["code", "Code"] {
        match value.get(key) {
            Some(Value::Number(number)) => return number.as_i64().unwrap_or(0),
            Some(Value::String(text)) => return text.parse::<i64>().unwrap_or(0),
            _ => {}
        }
    }
    0
}

fn map_to_json(values: &BTreeMap<String, String>) -> Value {
    let mut object = Map::new();
    for (key, value) in values {
        if !value.trim().is_empty() {
            object.insert(key.clone(), json!(value));
        }
    }
    Value::Object(object)
}

fn update_repo(provider: &str) -> String {
    if provider == "github" {
        let repo = manifest_update_repo("github");
        return if repo.is_empty() {
            OFFICIAL_SOURCE_REPO.to_string()
        } else {
            repo
        };
    }

    let env_repo =
        normalize_repo(&std::env::var("RISINGSTONES_UPDATE_GITEE_REPO").unwrap_or_default());
    if !env_repo.is_empty() {
        return env_repo;
    }
    manifest_update_repo(provider)
}

fn normalize_repo(value: &str) -> String {
    let trimmed = value.trim().trim_end_matches(".git");
    if trimmed.is_empty() {
        return String::new();
    }
    if let Some(path) = trimmed
        .strip_prefix("https://github.com/")
        .or_else(|| trimmed.strip_prefix("https://gitee.com/"))
    {
        return normalize_repo(path);
    }
    let parts: Vec<&str> = trimmed.split('/').collect();
    if parts.len() >= 2 && is_repo_part(parts[0]) && is_repo_part(parts[1]) {
        return format!("{}/{}", parts[0], parts[1].trim_end_matches(".git"));
    }
    String::new()
}

fn manifest_update_repo(provider: &str) -> String {
    for path in release_manifest_paths() {
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let repo = json
            .get("updateRepositories")
            .and_then(|value| value.get(provider))
            .and_then(Value::as_str)
            .map(normalize_repo)
            .unwrap_or_default();
        if !repo.is_empty() {
            return repo;
        }
    }
    String::new()
}

fn release_manifest_paths() -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            paths.push(parent.join("release-manifest.json"));
        }
    }
    if let Ok(current_dir) = std::env::current_dir() {
        paths.push(current_dir.join("release-manifest.json"));
    }
    paths
}

fn is_repo_part(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '.' | '-')
        })
}

fn recommend_update_provider(country_code: &str) -> &'static str {
    if country_code == "CN" && !update_repo("gitee").is_empty() {
        "gitee"
    } else {
        "github"
    }
}

fn fallback_update_provider() -> &'static str {
    if !update_repo("gitee").is_empty() {
        "gitee"
    } else {
        "github"
    }
}

fn provider_label(provider: &str) -> &'static str {
    if provider == "gitee" {
        "国内镜像"
    } else {
        "GitHub"
    }
}

fn is_version_newer(latest: &str, current: &str) -> bool {
    let latest_parts = parse_version_parts(latest);
    let current_parts = parse_version_parts(current);
    if latest_parts.is_none() || current_parts.is_none() {
        return normalize_version(latest) != normalize_version(current);
    }
    let latest_parts = latest_parts.unwrap();
    let current_parts = current_parts.unwrap();
    for index in 0..3 {
        let latest_value = latest_parts[index];
        let current_value = current_parts[index];
        if latest_value > current_value {
            return true;
        }
        if latest_value < current_value {
            return false;
        }
    }
    false
}

fn parse_version_parts(value: &str) -> Option<[u64; 3]> {
    let normalized = normalize_version(value);
    let mut parts = [0, 0, 0];
    for (index, part) in normalized.split('.').take(3).enumerate() {
        let digits: String = part.chars().take_while(char::is_ascii_digit).collect();
        if digits.is_empty() {
            return None;
        }
        parts[index] = digits.parse::<u64>().ok()?;
    }
    Some(parts)
}

fn normalize_version(value: &str) -> String {
    value.trim().trim_start_matches(['v', 'V']).to_string()
}

fn read_string(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn fallback_string(value: &Value, primary: &str, fallback: &str) -> String {
    let primary_value = read_string(value, primary);
    if primary_value.is_empty() {
        read_string(value, fallback)
    } else {
        primary_value
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}
