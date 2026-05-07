#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Utc;
use reqwest::header::{ACCEPT, ORIGIN, REFERER, USER_AGENT};
use serde_json::{json, Map, Value};
use std::{collections::BTreeMap, time::Duration};

const OFFICIAL_API_HOME: &str = "https://apiff14risingstones.web.sdo.com/api/home/";
const OFFICIAL_ORIGIN: &str = "https://ff14risingstones.web.sdo.com";
const OFFICIAL_REFERER: &str = "https://ff14risingstones.web.sdo.com/pc/index.html#/recruit/party";
const OFFICIAL_SOURCE_REPO: &str = "today080221/risingstones-partyfinder-helper";
const PAGE_SIZE: usize = 100;
const PAGE_DELAY_MS: u64 = 180;
const MAX_PAGES: usize = 80;

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            risingstones_version,
            risingstones_meta,
            risingstones_recruits,
            risingstones_recruit_detail,
            risingstones_geoip,
            risingstones_check_update
        ])
        .run(tauri::generate_context!())
        .expect("failed to run RisingStones desktop app");
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
        return OFFICIAL_SOURCE_REPO.to_string();
    }
    normalize_repo(&std::env::var("RISINGSTONES_UPDATE_GITEE_REPO").unwrap_or_default())
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
