#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Utc;
use reqwest::header::{ACCEPT, ACCEPT_ENCODING, ORIGIN, REFERER, USER_AGENT};
use serde_json::{json, Map, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::Path,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

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
const NGA_WINDOW_LABEL: &str = "nga-session";
const NGA_POPUP_WINDOW_PREFIX: &str = "nga-popup";
const NGA_DEFAULT_URL: &str = "https://bbs.nga.cn/";
const NGA_RECRUIT_STID_CN: &str = "44366746";
const NGA_RECRUIT_STID_JP: &str = "42005319";
const NGA_RECRUIT_STID_EU: &str = "30742918";
const NGA_RECRUIT_STID_OCE: &str = "30742942";
const NGA_RECRUIT_STID_US: &str = "30742904";
const NGA_PROFILE_DIR_NAME: &str = "nga-webview-profile";
const NGA_SAMPLE_STORE_FILE_NAME: &str = "nga-samples.json";
const NGA_MIN_REQUEST_INTERVAL_MS: u64 = 500;
const NGA_MAX_REQUEST_INTERVAL_MS: u64 = 15000;
const NGA_MAX_ITEMS_LIMIT: usize = 1500;
const NGA_EVAL_TIMEOUT_SECS: u64 = 8;

#[derive(Default)]
struct NgaCollectState {
    cancelled: AtomicBool,
    progress: Mutex<Value>,
}

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
async fn risingstones_nga_session_status(app: AppHandle) -> Result<Value, String> {
    Ok(json!({
        "available": true,
        "loginStatus": "unknown",
        "keepLogin": app.get_webview_window(NGA_WINDOW_LABEL).is_some(),
        "dataLocation": nga_profile_dir(&app)?.display().to_string(),
        "message": "NGA 页面状态由页面自身显示；本工具只读取页面已渲染的公开招募内容。",
        "autoCollectOnStart": std::env::var("RISINGSTONES_NGA_AUTO_COLLECT_ON_START")
            .map(|value| value == "1")
            .unwrap_or(false)
    }))
}

#[tauri::command]
async fn risingstones_nga_open_session(
    app: AppHandle,
    keep_login: bool,
    start_url: String,
) -> Result<Value, String> {
    let url = normalize_nga_url(&start_url)?;
    let popup_data_dir = if keep_login {
        Some(nga_profile_dir(&app)?)
    } else {
        None
    };

    close_nga_popup_windows(&app);
    if let Some(existing) = app.get_webview_window(NGA_WINDOW_LABEL) {
        let _ = existing.close();
        tokio::time::sleep(Duration::from_millis(150)).await;
    }

    let popup_app = app.clone();
    let popup_data_dir_for_handler = popup_data_dir.clone();
    let mut builder = WebviewWindowBuilder::new(
        &app,
        NGA_WINDOW_LABEL,
        WebviewUrl::External(url.clone()),
    )
    .title("NGA 招募读取")
    .inner_size(1120.0, 820.0)
    .min_inner_size(920.0, 680.0)
    .user_agent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    )
    .on_new_window(move |url, features| {
        let label = format!(
            "{NGA_POPUP_WINDOW_PREFIX}-{}",
            Utc::now().timestamp_millis()
        );
        let mut popup_builder = WebviewWindowBuilder::new(
            &popup_app,
            &label,
            WebviewUrl::External(url.clone()),
        )
        .title(url.as_str())
        .inner_size(980.0, 760.0)
        .min_inner_size(720.0, 560.0)
        .window_features(features)
        .on_document_title_changed(|window, title| {
            let _ = window.set_title(&title);
        })
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        );

        let nested_popup_app = popup_app.clone();
        let nested_popup_data_dir = popup_data_dir_for_handler.clone();
        popup_builder = popup_builder.on_new_window(move |nested_url, nested_features| {
            let nested_label = format!(
                "{NGA_POPUP_WINDOW_PREFIX}-{}",
                Utc::now().timestamp_millis()
            );
            let mut nested_builder = WebviewWindowBuilder::new(
                &nested_popup_app,
                &nested_label,
                WebviewUrl::External(nested_url.clone()),
            )
            .title(nested_url.as_str())
            .inner_size(980.0, 760.0)
            .min_inner_size(720.0, 560.0)
            .window_features(nested_features)
            .on_document_title_changed(|window, title| {
                let _ = window.set_title(&title);
            })
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
            );

            if let Some(data_dir) = nested_popup_data_dir.clone() {
                nested_builder = nested_builder.data_directory(data_dir);
            } else {
                nested_builder = nested_builder.incognito(true);
            }

            match nested_builder.build() {
                Ok(window) => NewWindowResponse::Create { window },
                Err(_) => NewWindowResponse::Allow,
            }
        });

        if let Some(data_dir) = popup_data_dir_for_handler.clone() {
            popup_builder = popup_builder.data_directory(data_dir);
        } else {
            popup_builder = popup_builder.incognito(true);
        }

        match popup_builder.build() {
            Ok(window) => NewWindowResponse::Create { window },
            Err(_) => NewWindowResponse::Allow,
        }
    });

    if keep_login {
        let data_dir = popup_data_dir
            .clone()
            .ok_or_else(|| "NGA 本机网页状态目录读取失败。".to_string())?;
        fs::create_dir_all(&data_dir)
            .map_err(|error| format!("NGA 本机网页状态目录创建失败：{error}"))?;
        builder = builder.data_directory(data_dir);
    } else {
        builder = builder.incognito(true);
    }

    let window = builder
        .build()
        .map_err(|error| format!("NGA 窗口打开失败：{error}"))?;
    let _ = window.set_focus();

    Ok(json!({
        "available": true,
        "loginStatus": "unknown",
        "keepLogin": keep_login,
        "dataLocation": if keep_login { nga_profile_dir(&app)?.display().to_string() } else { "临时本机网页会话，关闭后不保留。".to_string() },
        "message": "请在 NGA 窗口中打开需要读取的招募列表或帖子页面。",
        "openedUrl": url.to_string()
    }))
}

#[tauri::command]
async fn risingstones_nga_navigate_session(
    app: AppHandle,
    start_url: String,
) -> Result<Value, String> {
    let url = normalize_nga_url(&start_url)?;
    if !is_supported_nga_collect_url(&url) {
        return Err("只能切换到已支持的 NGA 招募板或帖子详情页。".to_string());
    }
    let Some(window) = app.get_webview_window(NGA_WINDOW_LABEL) else {
        return Err("请先打开 NGA 窗口。".to_string());
    };

    let target = serde_json::to_string(url.as_str())
        .map_err(|error| format!("NGA 页面地址序列化失败：{error}"))?;
    window
        .eval(&format!("location.assign({target});"))
        .map_err(|error| format!("NGA 页面切换失败：{error}"))?;

    Ok(json!({
        "opened": true,
        "allowed": true,
        "currentUrl": url.to_string(),
        "openedUrl": url.to_string(),
        "message": "已切换到 NGA 招募板。"
    }))
}

#[tauri::command]
async fn risingstones_nga_visible_page_status(app: AppHandle) -> Result<Value, String> {
    let Some(window) = app.get_webview_window(NGA_WINDOW_LABEL) else {
        return Ok(json!({
            "opened": false,
            "allowed": false,
            "currentUrl": "",
            "state": "closed",
            "targetUrl": "",
            "message": "NGA 窗口未打开。"
        }));
    };

    let url = window
        .url()
        .map_err(|error| format!("NGA 当前页面地址读取失败：{error}"))?;
    let host_allowed = is_allowed_nga_host(url.host_str().unwrap_or_default());
    let allowed = is_supported_nga_collect_url(&url);
    let interstitial_target = extract_nga_interstitial_target(&url);
    let is_interstitial = interstitial_target.is_some();
    Ok(json!({
        "opened": true,
        "allowed": allowed,
        "currentUrl": url.to_string(),
        "state": if allowed {
            "ready"
        } else if is_interstitial {
            "interstitial"
        } else {
            "unsupported"
        },
        "targetUrl": interstitial_target.map(|target| target.to_string()).unwrap_or_default(),
        "message": if allowed {
            "当前位于已支持的 NGA 招募板或帖子详情页，可读取当前可见内容。"
        } else if is_interstitial {
            "当前位于继续浏览页；请在 NGA 窗口点继续，回到目标页面后会自动重试。"
        } else if host_allowed {
            "当前是 NGA 页面，但不是已支持的招募板或帖子详情；请打开国服/日服招募板或具体帖子。"
        } else {
            "当前不是 NGA 招募页；待回到招募列表或帖子页后再读取。"
        }
    }))
}

#[tauri::command]
async fn risingstones_nga_clear_session(app: AppHandle) -> Result<Value, String> {
    if let Some(window) = app.get_webview_window(NGA_WINDOW_LABEL) {
        let _ = window.clear_all_browsing_data();
        let _ = window.close();
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    close_nga_popup_windows(&app);

    let data_dir = nga_profile_dir(&app)?;
    let mut cleared = false;
    if data_dir.exists() {
        fs::remove_dir_all(&data_dir)
            .map_err(|error| format!("NGA 本机网页状态清理失败：{error}"))?;
        cleared = true;
    }

    Ok(json!({
        "message": "已清理本应用 NGA 本机网页数据；不会影响系统浏览器。",
        "dataLocation": data_dir.display().to_string(),
        "cleared": cleared
    }))
}

#[tauri::command]
async fn risingstones_nga_load_samples(app: AppHandle) -> Result<Value, String> {
    let data_path = nga_sample_store_path(&app)?;
    if !data_path.exists() {
        return Ok(json!({
            "samples": [],
            "count": 0,
            "dataLocation": data_path.display().to_string(),
            "message": "尚未保存 NGA 招募。"
        }));
    }

    let text =
        fs::read_to_string(&data_path).map_err(|error| format!("NGA 本地招募读取失败：{error}"))?;
    let payload: Value = serde_json::from_str(&text)
        .map_err(|error| format!("NGA 本地招募 JSON 解析失败：{error}"))?;
    let raw_samples = if let Some(samples) = payload.get("samples").and_then(Value::as_array) {
        samples.clone()
    } else if let Some(samples) = payload.as_array() {
        samples.clone()
    } else {
        Vec::new()
    };
    let samples = sanitize_nga_samples(raw_samples, NGA_MAX_ITEMS_LIMIT);
    let count = samples.len();
    let saved_at = payload
        .get("savedAt")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    Ok(json!({
        "samples": samples,
        "count": count,
        "dataLocation": data_path.display().to_string(),
        "message": format!("已读取 {} 条 NGA 已保存招募。", count),
        "savedAt": saved_at
    }))
}

#[tauri::command]
async fn risingstones_nga_save_samples(
    app: AppHandle,
    samples: Vec<Value>,
) -> Result<Value, String> {
    let data_path = nga_sample_store_path(&app)?;
    if let Some(parent) = data_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("NGA 本地招募目录创建失败：{error}"))?;
    }
    let sanitized = sanitize_nga_samples(samples, NGA_MAX_ITEMS_LIMIT);
    let count = sanitized.len();
    let saved_at = now_iso();
    let payload = json!({
        "savedAt": saved_at,
        "count": count,
        "samples": sanitized
    });
    let text = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("NGA 本地招募序列化失败：{error}"))?;
    fs::write(&data_path, text).map_err(|error| format!("NGA 本地招募保存失败：{error}"))?;

    Ok(json!({
        "samples": sanitized,
        "count": count,
        "dataLocation": data_path.display().to_string(),
        "message": format!("已保存 {} 条 NGA 招募。", count),
        "savedAt": saved_at
    }))
}

#[tauri::command]
async fn risingstones_nga_cancel_collect(
    state: tauri::State<'_, NgaCollectState>,
) -> Result<Value, String> {
    state.cancelled.store(true, Ordering::SeqCst);
    let progress = json!({
        "status": "cancelled",
        "currentUrl": "",
        "collected": 0,
        "maxItems": 0,
        "message": "已请求停止 NGA 读取。",
        "finishedAt": now_iso()
    });
    *state
        .progress
        .lock()
        .map_err(|_| "NGA 读取状态锁定失败。".to_string())? = progress.clone();
    Ok(progress)
}

#[tauri::command]
async fn risingstones_nga_collection_progress(
    state: tauri::State<'_, NgaCollectState>,
) -> Result<Value, String> {
    Ok(state
        .progress
        .lock()
        .map_err(|_| "NGA 读取状态锁定失败。".to_string())?
        .clone())
}

#[tauri::command]
async fn risingstones_nga_collect_visible_samples(
    app: AppHandle,
    state: tauri::State<'_, NgaCollectState>,
    max_items: usize,
    request_interval_ms: u64,
    include_details: bool,
) -> Result<Value, String> {
    let window = app
        .get_webview_window(NGA_WINDOW_LABEL)
        .ok_or_else(|| "请先打开 NGA 窗口。".to_string())?;
    let current_url = window
        .url()
        .map_err(|error| format!("NGA 当前页面地址读取失败：{error}"))?;
    if !is_supported_nga_collect_url(&current_url) {
        if extract_nga_interstitial_target(&current_url).is_some() {
            return Err("当前位于继续浏览页，请在 NGA 窗口点继续后再读取。".to_string());
        }
        return Err("当前页面不是受支持的 NGA 招募板或帖子详情。".to_string());
    }

    let max_items = max_items.clamp(1, NGA_MAX_ITEMS_LIMIT);
    let interval =
        request_interval_ms.clamp(NGA_MIN_REQUEST_INTERVAL_MS, NGA_MAX_REQUEST_INTERVAL_MS);
    state.cancelled.store(false, Ordering::SeqCst);
    let started_at = now_iso();
    set_nga_progress(
        &state,
        json!({
            "status": "collecting",
            "currentUrl": current_url.to_string(),
            "collected": 0,
            "maxItems": max_items,
            "message": if include_details {
                format!("等待请求间隔 {}ms 后读取当前页，并逐个打开帖子详情补齐正文。", interval)
            } else {
                format!("等待请求间隔 {}ms 后读取当前可见页面。", interval)
            },
            "startedAt": started_at
        }),
    )?;

    tokio::time::sleep(Duration::from_millis(interval)).await;
    if state.cancelled.load(Ordering::SeqCst) {
        let progress = json!({
            "status": "cancelled",
            "currentUrl": current_url.to_string(),
            "collected": 0,
            "maxItems": max_items,
            "message": "NGA 读取已取消。",
            "startedAt": started_at,
            "finishedAt": now_iso()
        });
        set_nga_progress(&state, progress.clone())?;
        return Ok(json!({
            "samples": [],
            "progress": progress,
            "warnings": ["读取已取消。"],
            "fetchedAt": now_iso()
        }));
    }

    let mut warnings = Vec::new();
    let (mut samples, mut was_cancelled) = if is_nga_board_url(&current_url) {
        collect_nga_board_samples(
            &window,
            &state,
            &current_url,
            max_items,
            interval,
            &started_at,
        )
        .await?
    } else {
        let raw_samples = eval_nga_samples(&window, max_items)?;
        (sanitize_nga_samples(raw_samples, max_items), false)
    };
    if include_details && !samples.is_empty() && !was_cancelled {
        let detail_result =
            collect_nga_detail_samples(&window, &state, samples, max_items, interval, &started_at)
                .await?;
        samples = detail_result.0;
        was_cancelled = detail_result.1;
    }
    let status = if was_cancelled {
        "cancelled"
    } else if samples.is_empty() {
        "error"
    } else {
        "completed"
    };
    let message = if samples.is_empty() {
        "当前页面没有识别到可读取的帖子；请确认 NGA 页面已正常加载。".to_string()
    } else if was_cancelled {
        format!(
            "NGA 详情正文读取已停止，已保留 {} 条招募记录。",
            samples.len()
        )
    } else if include_details {
        format!("已读取 {} 条招募记录，并尝试补齐帖子正文。", samples.len())
    } else {
        format!("已读取 {} 条招募记录。", samples.len())
    };
    if samples.is_empty() {
        warnings.push("当前页面没有识别到帖子链接或正文。".to_string());
    }
    if was_cancelled {
        warnings.push("读取已取消，已返回取消前保留的招募记录。".to_string());
    }
    let progress = json!({
        "status": status,
        "currentUrl": current_url.to_string(),
        "collected": samples.len(),
        "maxItems": max_items,
        "message": message,
        "startedAt": started_at,
        "finishedAt": now_iso()
    });
    set_nga_progress(&state, progress.clone())?;

    Ok(json!({
        "samples": samples,
        "progress": progress,
        "warnings": warnings,
        "fetchedAt": now_iso()
    }))
}

#[tauri::command]
async fn risingstones_nga_collect_sample_details(
    app: AppHandle,
    state: tauri::State<'_, NgaCollectState>,
    samples: Vec<Value>,
    max_items: usize,
    request_interval_ms: u64,
) -> Result<Value, String> {
    let window = app
        .get_webview_window(NGA_WINDOW_LABEL)
        .ok_or_else(|| "请先打开 NGA 窗口。".to_string())?;
    let current_url = window
        .url()
        .map_err(|error| format!("NGA 当前页面地址读取失败：{error}"))?;
    if !is_allowed_nga_host(current_url.host_str().unwrap_or_default()) {
        return Err("当前页面不是受支持的 NGA 地址。".to_string());
    }

    let max_items = max_items.clamp(1, NGA_MAX_ITEMS_LIMIT);
    let interval =
        request_interval_ms.clamp(NGA_MIN_REQUEST_INTERVAL_MS, NGA_MAX_REQUEST_INTERVAL_MS);
    let source_samples = sanitize_nga_samples(samples, max_items);
    if source_samples.is_empty() {
        return Err("没有可补正文的 NGA 招募。".to_string());
    }

    state.cancelled.store(false, Ordering::SeqCst);
    let started_at = now_iso();
    set_nga_progress(
        &state,
        json!({
            "status": "collecting",
            "currentUrl": current_url.to_string(),
            "collected": 0,
            "maxItems": source_samples.len(),
            "message": format!("准备按 {}ms 间隔为已存招募补齐帖子正文。", interval),
            "startedAt": started_at
        }),
    )?;

    let before_with_body = source_samples
        .iter()
        .filter(|sample| !read_string(sample, "body").trim().is_empty())
        .count();
    let (samples, was_cancelled) = collect_nga_detail_samples(
        &window,
        &state,
        source_samples,
        max_items,
        interval,
        &started_at,
    )
    .await?;
    let after_with_body = samples
        .iter()
        .filter(|sample| !read_string(sample, "body").trim().is_empty())
        .count();
    let updated = after_with_body.saturating_sub(before_with_body);
    let status = if was_cancelled {
        "cancelled"
    } else {
        "completed"
    };
    let message = if was_cancelled {
        format!("正文补齐已停止，本轮新增 {} 条正文。", updated)
    } else {
        format!("正文补齐完成，本轮新增 {} 条正文。", updated)
    };
    let progress = json!({
        "status": status,
        "currentUrl": window.url().map(|url| url.to_string()).unwrap_or_default(),
        "collected": samples.len(),
        "maxItems": max_items,
        "message": message,
        "startedAt": started_at,
        "finishedAt": now_iso()
    });
    set_nga_progress(&state, progress.clone())?;

    Ok(json!({
        "samples": samples,
        "updated": updated,
        "progress": progress,
        "warnings": if was_cancelled { vec!["读取已取消，已返回取消前保留的招募记录。".to_string()] } else { Vec::new() },
        "fetchedAt": now_iso()
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
        .manage(NgaCollectState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            risingstones_version,
            risingstones_meta,
            risingstones_recruits,
            risingstones_recruit_detail,
            risingstones_geoip,
            risingstones_nga_session_status,
            risingstones_nga_open_session,
            risingstones_nga_navigate_session,
            risingstones_nga_visible_page_status,
            risingstones_nga_clear_session,
            risingstones_nga_load_samples,
            risingstones_nga_save_samples,
            risingstones_nga_cancel_collect,
            risingstones_nga_collection_progress,
            risingstones_nga_collect_visible_samples,
            risingstones_nga_collect_sample_details,
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
                .get(job_group_key(category_name))
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

fn job_group_key(group: &str) -> &str {
    match group {
        "远程物理" => "远程物理职业",
        "远程魔法" => "远程魔法职业",
        _ => group,
    }
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

fn normalize_nga_url(value: &str) -> Result<Url, String> {
    let raw = if value.trim().is_empty() {
        NGA_DEFAULT_URL
    } else {
        value.trim()
    };
    let mut url = Url::parse(raw)
        .or_else(|_| Url::parse(NGA_DEFAULT_URL))
        .map_err(|error| format!("NGA 地址解析失败：{error}"))?;
    if !is_allowed_nga_host(url.host_str().unwrap_or_default()) {
        url = Url::parse(NGA_DEFAULT_URL)
            .map_err(|error| format!("NGA 默认地址解析失败：{error}"))?;
    }
    if url.scheme() != "https" && url.scheme() != "http" {
        url = Url::parse(NGA_DEFAULT_URL)
            .map_err(|error| format!("NGA 默认地址解析失败：{error}"))?;
    }
    let _ = url.set_scheme("https");
    if let Some(board_url) = canonicalize_nga_board_url(&url) {
        return Url::parse(&board_url)
            .map_err(|error| format!("NGA 招募板地址规范化失败：{error}"));
    }
    Ok(url)
}

fn is_allowed_nga_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    host == "bbs.nga.cn"
        || host == "ngabbs.com"
        || host == "nga.178.com"
        || host.ends_with(".nga.cn")
}

fn is_supported_nga_collect_url(url: &Url) -> bool {
    if !is_allowed_nga_host(url.host_str().unwrap_or_default()) {
        return false;
    }

    let path = url.path().to_ascii_lowercase();
    let path_file = path.rsplit('/').next().unwrap_or(path.as_str());
    let has_tid = url
        .query_pairs()
        .any(|(key, value)| key.as_ref().eq_ignore_ascii_case("tid") && !value.is_empty());
    if path_file == "read.php" {
        return has_tid;
    }

    if path_file != "thread.php" {
        return false;
    }

    url.query_pairs().any(|(key, value)| {
        key.as_ref().eq_ignore_ascii_case("stid") && is_supported_nga_board_stid(value.as_ref())
    })
}

fn is_nga_board_url(url: &Url) -> bool {
    if !is_supported_nga_collect_url(url) {
        return false;
    }
    let path = url.path().to_ascii_lowercase();
    path.rsplit('/').next().unwrap_or(path.as_str()) == "thread.php"
}

fn is_supported_nga_board_stid(value: &str) -> bool {
    let value = value.trim();
    value == NGA_RECRUIT_STID_CN
        || value == NGA_RECRUIT_STID_JP
        || value == NGA_RECRUIT_STID_EU
        || value == NGA_RECRUIT_STID_OCE
        || value == NGA_RECRUIT_STID_US
}

fn canonicalize_nga_board_url(url: &Url) -> Option<String> {
    if !is_allowed_nga_host(url.host_str().unwrap_or_default()) {
        return None;
    }
    let path = url.path().to_ascii_lowercase();
    let path_file = path.rsplit('/').next().unwrap_or(path.as_str());
    if path_file != "thread.php" {
        return None;
    }
    let stid = url.query_pairs().find_map(|(key, value)| {
        key.as_ref()
            .eq_ignore_ascii_case("stid")
            .then(|| value.to_string())
    })?;
    if !is_supported_nga_board_stid(&stid) {
        return None;
    }
    Some(format!(
        "https://bbs.nga.cn/thread.php?stid={}",
        stid.trim()
    ))
}

fn is_same_nga_collect_target(current_url: &Url, expected_url: &Url) -> bool {
    if !is_supported_nga_collect_url(current_url) || !is_supported_nga_collect_url(expected_url) {
        return false;
    }
    let current_path = current_url.path().to_ascii_lowercase();
    let expected_path = expected_url.path().to_ascii_lowercase();
    let current_file = current_path
        .rsplit('/')
        .next()
        .unwrap_or(current_path.as_str());
    let expected_file = expected_path
        .rsplit('/')
        .next()
        .unwrap_or(expected_path.as_str());
    if current_file != expected_file {
        return false;
    }
    if expected_file == "thread.php" {
        if query_value(current_url, "stid") != query_value(expected_url, "stid") {
            return false;
        }
        if let Some(expected_page) = query_value(expected_url, "page") {
            return query_value(current_url, "page").unwrap_or_else(|| "1".to_string())
                == expected_page;
        }
        return true;
    }
    if expected_file == "read.php" {
        return query_value(current_url, "tid") == query_value(expected_url, "tid");
    }
    false
}

fn is_same_nga_board_series(current_url: &Url, expected_url: &Url) -> bool {
    is_nga_board_url(current_url)
        && is_nga_board_url(expected_url)
        && query_value(current_url, "stid") == query_value(expected_url, "stid")
}

fn nga_page_visit_key(url: &Url) -> String {
    let stid = query_value(url, "stid").unwrap_or_default();
    let page = query_value(url, "page").unwrap_or_else(|| "1".to_string());
    format!("{stid}:{page}")
}

fn nga_sample_key(sample: &Value) -> String {
    let topic_id = read_string(sample, "topicId");
    if !topic_id.trim().is_empty() {
        return topic_id;
    }
    let url = read_string(sample, "url");
    if !url.trim().is_empty() {
        return url;
    }
    format!(
        "{}:{}",
        read_string(sample, "title"),
        read_string(sample, "author")
    )
}

fn query_value(url: &Url, name: &str) -> Option<String> {
    url.query_pairs().find_map(|(key, value)| {
        key.as_ref()
            .eq_ignore_ascii_case(name)
            .then(|| value.to_string())
    })
}

fn extract_nga_interstitial_target(url: &Url) -> Option<Url> {
    if !is_allowed_nga_host(url.host_str().unwrap_or_default()) {
        return None;
    }
    let path = url.path().to_ascii_lowercase();
    if !path.ends_with("/misc/adpage_insert_2.html") && !path.ends_with("misc/adpage_insert_2.html")
    {
        return None;
    }
    let raw = url.query()?.trim();
    let decoded = raw
        .replace("%3A", ":")
        .replace("%3a", ":")
        .replace("%2F", "/")
        .replace("%2f", "/")
        .replace("%3F", "?")
        .replace("%3f", "?")
        .replace("%3D", "=")
        .replace("%3d", "=")
        .replace("%26", "&");
    let target = Url::parse(&decoded).ok()?;
    if is_supported_nga_collect_url(&target) {
        Some(target)
    } else {
        None
    }
}

fn nga_profile_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("应用数据目录读取失败：{error}"))?
        .join(NGA_PROFILE_DIR_NAME))
}

fn nga_sample_store_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("应用数据目录读取失败：{error}"))?
        .join(NGA_SAMPLE_STORE_FILE_NAME))
}

fn set_nga_progress(
    state: &tauri::State<'_, NgaCollectState>,
    progress: Value,
) -> Result<(), String> {
    *state
        .progress
        .lock()
        .map_err(|_| "NGA 读取状态锁定失败。".to_string())? = progress;
    Ok(())
}

fn close_nga_popup_windows(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(NGA_POPUP_WINDOW_PREFIX) {
            let _ = window.close();
        }
    }
}

struct NgaPageSnapshot {
    samples: Vec<Value>,
    next_url: Option<Url>,
}

async fn collect_nga_board_samples(
    window: &tauri::WebviewWindow,
    state: &tauri::State<'_, NgaCollectState>,
    start_url: &Url,
    max_items: usize,
    interval: u64,
    started_at: &str,
) -> Result<(Vec<Value>, bool), String> {
    let mut collected = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    let mut visited_pages = std::collections::BTreeSet::new();
    let mut expected_url = start_url.clone();
    let mut page_index = 1usize;
    let mut cancelled = false;

    loop {
        if collected.len() >= max_items {
            break;
        }
        if state.cancelled.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }
        if !visited_pages.insert(nga_page_visit_key(&expected_url)) {
            break;
        }

        let ready = wait_for_expected_nga_page(
            window,
            state,
            &expected_url,
            interval,
            started_at,
            collected.len(),
            max_items,
        )
        .await?;
        if !ready {
            break;
        }

        set_nga_progress(
            state,
            json!({
                "status": "collecting",
                "currentUrl": window.url().map(|url| url.to_string()).unwrap_or_else(|_| expected_url.to_string()),
                "collected": collected.len(),
                "maxItems": max_items,
                "message": format!("正在读取招募板第 {} 页，已找到 {}/{} 条。", page_index, collected.len(), max_items),
                "startedAt": started_at
            }),
        )?;

        let remaining = max_items.saturating_sub(collected.len());
        let snapshot = eval_nga_page_snapshot(window, remaining)?;
        let page_samples = sanitize_nga_samples(snapshot.samples, remaining);
        for sample in page_samples {
            if collected.len() >= max_items {
                break;
            }
            let key = nga_sample_key(&sample);
            if key.is_empty() || seen.contains(&key) {
                continue;
            }
            seen.insert(key);
            collected.push(sample);
        }

        let Some(next_url) = snapshot.next_url else {
            break;
        };
        if collected.len() >= max_items {
            break;
        }
        if !is_same_nga_board_series(&next_url, start_url)
            || visited_pages.contains(&nga_page_visit_key(&next_url))
        {
            break;
        }

        page_index += 1;
        set_nga_progress(
            state,
            json!({
                "status": "collecting",
                "currentUrl": next_url.to_string(),
                "collected": collected.len(),
                "maxItems": max_items,
                "message": format!("正在翻到招募板第 {} 页，已找到 {}/{} 条。", page_index, collected.len(), max_items),
                "startedAt": started_at
            }),
        )?;
        let target = serde_json::to_string(next_url.as_str())
            .map_err(|error| format!("NGA 下一页地址序列化失败：{error}"))?;
        window
            .eval(format!("location.assign({target});"))
            .map_err(|error| format!("NGA 招募板下一页打开失败：{error}"))?;
        tokio::time::sleep(Duration::from_millis(interval)).await;
        expected_url = next_url;
    }

    Ok((sanitize_nga_samples(collected, max_items), cancelled))
}

async fn collect_nga_detail_samples(
    window: &tauri::WebviewWindow,
    state: &tauri::State<'_, NgaCollectState>,
    samples: Vec<Value>,
    max_items: usize,
    interval: u64,
    started_at: &str,
) -> Result<(Vec<Value>, bool), String> {
    let mut detailed = Vec::new();
    let mut cancelled = false;

    for sample in samples {
        if detailed.len() >= max_items {
            break;
        }
        if state.cancelled.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }

        let original_body = read_string(&sample, "body");
        let url = limited_clean_string(&sample, "url", 1000);
        if url.is_empty() || !original_body.trim().is_empty() {
            detailed.push(sample);
            continue;
        }

        let parsed_url =
            Url::parse(&url).map_err(|error| format!("NGA 帖子地址解析失败：{error}"))?;
        if !is_allowed_nga_host(parsed_url.host_str().unwrap_or_default()) {
            detailed.push(sample);
            continue;
        }

        set_nga_progress(
            state,
            json!({
                "status": "collecting",
                "currentUrl": url,
                "collected": detailed.len(),
                "maxItems": max_items,
                "message": format!("正在打开第 {}/{} 个帖子详情读取正文。", detailed.len() + 1, max_items),
                "startedAt": started_at
            }),
        )?;

        let target = serde_json::to_string(&url)
            .map_err(|error| format!("NGA 详情地址序列化失败：{error}"))?;
        window
            .eval(format!("location.assign({target});"))
            .map_err(|error| format!("NGA 详情页打开失败：{error}"))?;
        tokio::time::sleep(Duration::from_millis(interval)).await;
        let ready = wait_for_expected_nga_page(
            window,
            state,
            &parsed_url,
            interval,
            started_at,
            detailed.len(),
            max_items,
        )
        .await?;
        if !ready {
            detailed.push(sample);
            continue;
        }

        if state.cancelled.load(Ordering::SeqCst) {
            cancelled = true;
            detailed.push(sample);
            break;
        }

        let detail_samples = sanitize_nga_samples(eval_nga_samples(window, 1)?, 1);
        if let Some(detail) = detail_samples.into_iter().next() {
            let detail_body = read_string(&detail, "body");
            if !detail_body.trim().is_empty() {
                detailed.push(detail);
            } else {
                detailed.push(sample);
            }
        } else {
            detailed.push(sample);
        }
    }

    Ok((sanitize_nga_samples(detailed, max_items), cancelled))
}

async fn wait_for_expected_nga_page(
    window: &tauri::WebviewWindow,
    state: &tauri::State<'_, NgaCollectState>,
    expected_url: &Url,
    interval: u64,
    started_at: &str,
    collected: usize,
    max_items: usize,
) -> Result<bool, String> {
    let normal_attempts = (12_000_u64 / interval.max(1)).clamp(3, 12);
    let interstitial_attempts = (45_000_u64 / interval.max(1)).clamp(normal_attempts, 45);
    let mut attempt = 1;
    while attempt <= interstitial_attempts {
        if state.cancelled.load(Ordering::SeqCst) {
            return Ok(false);
        }
        let current_url = window
            .url()
            .map_err(|error| format!("NGA 当前页面地址读取失败：{error}"))?;
        if is_same_nga_collect_target(&current_url, expected_url) {
            return Ok(true);
        }
        if let Some(target) = extract_nga_interstitial_target(&current_url) {
            set_nga_progress(
                state,
                json!({
                    "status": "collecting",
                    "currentUrl": current_url.to_string(),
                    "collected": collected,
                    "maxItems": max_items,
                    "message": format!("帖子打开了继续浏览页，请在 NGA 窗口点继续；第 {}/{} 次检查。", attempt, interstitial_attempts),
                    "startedAt": started_at
                }),
            )?;
            if !is_same_nga_collect_target(&target, expected_url) {
                return Ok(false);
            }
            tokio::time::sleep(Duration::from_millis(interval)).await;
            attempt += 1;
            continue;
        }
        if attempt >= normal_attempts {
            return Ok(false);
        }
        tokio::time::sleep(Duration::from_millis(interval)).await;
        attempt += 1;
    }
    Ok(false)
}

fn eval_nga_samples(window: &tauri::WebviewWindow, max_items: usize) -> Result<Vec<Value>, String> {
    Ok(eval_nga_page_snapshot(window, max_items)?.samples)
}

fn eval_nga_page_snapshot(
    window: &tauri::WebviewWindow,
    max_items: usize,
) -> Result<NgaPageSnapshot, String> {
    let script = r##"
(() => {
  const maxItems = __MAX_ITEMS__;
  const absoluteUrl = (value) => {
    try { return new URL(value || location.href, location.href).toString(); } catch (_) { return ""; }
  };
  const idFromUrl = (url, key) => {
    try { return new URL(url).searchParams.get(key) || ""; } catch (_) { return ""; }
  };
  const text = (node) => (node && node.textContent ? node.textContent.replace(/\s+/g, " ").trim() : "");
  const firstText = (selectors) => {
    for (const selector of selectors) {
      const value = text(document.querySelector(selector));
      if (value) return value;
    }
    return "";
  };
  const publishedFrom = (root) => {
    const value = text(root || document.body);
    const match = value.match(/20\d{2}[-/年.]\d{1,2}[-/月.]\d{1,2}(?:\s+\d{1,2}[:：]\d{2})?/);
    return match ? match[0] : "";
  };
  const postIndexFrom = (node) => {
    const value = node && node.id ? node.id : "";
    const match = value.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  };
  const authorKey = (value) => {
    const raw = String(value || "");
    const uid = raw.match(/UID[:：]?\s*(\d+)/i) || raw.match(/#\d+\s*([^\s#]+)/);
    return uid ? uid[1] : raw.replace(/\s+/g, "").slice(0, 40);
  };
  const isNoiseFloor = (value) => {
    const normalized = String(value || "").replace(/\s+/g, "");
    return !normalized || normalized.length < 18 || /^(顶|帮顶|mark|蹲|插眼|收藏|前排|111+|纯顶|路过|dd|up)+$/i.test(normalized);
  };
  const currentUrl = absoluteUrl(location.href);
  const forumId = idFromUrl(currentUrl, "fid");
  const topicId = idFromUrl(currentUrl, "tid");
  let nextUrl = "";
  const samples = [];

  if (topicId) {
    const title = firstText(["#postsubject0", "[id^='postsubject']", ".postsubject", "h1"]) || document.title.replace(/ - NGA.*$/, "");
    const contentNodes = Array.from(new Set(Array.from(document.querySelectorAll("[id^='postcontent'], .postcontent, .postbody"))));
    const firstAuthor = text(document.querySelector("#posterinfo0, [id='posterinfo0'], [id^='posterinfo'], .posterinfo, .author"));
    const firstAuthorKey = authorKey(firstAuthor);
    const floors = contentNodes
      .map((node) => {
        const index = postIndexFrom(node);
        const author = text(document.querySelector(`#posterinfo${index}`)) || firstAuthor;
        return { index, author, authorKey: authorKey(author), body: text(node) };
      })
      .filter((item, index, list) => item.body && list.findIndex((other) => other.body === item.body) === index)
      .sort((a, b) => a.index - b.index);
    const firstFloor = floors.find((item) => item.index === 0) || floors[0];
    const authorFloors = floors
      .filter((item) => item !== firstFloor && item.authorKey && item.authorKey === firstAuthorKey && !isNoiseFloor(item.body))
      .map((item) => item.body);
    const bodyParts = [firstFloor?.body || "", ...authorFloors].filter(Boolean);
    const body = bodyParts.length ? bodyParts.join("\n\n") : text(document.body).slice(0, 5000);
    samples.push({ title, body, url: currentUrl, author: firstAuthor, publishedAt: publishedFrom(document.body), forumId, topicId });
  } else {
    const currentStid = idFromUrl(currentUrl, "stid");
    const currentPage = Number(idFromUrl(currentUrl, "page") || "1") || 1;
    const topicLinks = Array.from(document.querySelectorAll("a.topic[href*='read.php'][href*='tid=']"));
    const fallbackLinks = Array.from(document.querySelectorAll("a[href*='read.php?tid='], a[href*='read.php'][href*='tid=']"));
    const links = topicLinks.length ? topicLinks : fallbackLinks;
    const seen = new Set();
    for (const link of links) {
      if (samples.length >= maxItems) break;
      const url = absoluteUrl(link.getAttribute("href"));
      const tid = idFromUrl(url, "tid");
      if (!tid || tid === currentStid || seen.has(tid)) continue;
      const className = String(link.className || "");
      if (!topicLinks.length && /nav_link|replies|silver|uitxt|txtbtn/i.test(className)) continue;
      seen.add(tid);
      const root = link.closest("tr, .topic, .thread, .row, li, article, div") || link.parentElement || document.body;
      const title = text(link);
      if (!title || title.length < 4) continue;
      samples.push({
        title,
        body: "",
        url,
        author: text(root.querySelector(".author, [class*='author'], [id*='author']")),
        publishedAt: publishedFrom(root),
        forumId: idFromUrl(url, "fid") || forumId,
        topicId: tid
      });
    }
    const nextLinks = Array.from(document.querySelectorAll("a[title*='加载下一页'], a[href*='thread.php'][href*='page=']"));
    const candidates = [];
    for (const link of nextLinks) {
      const href = absoluteUrl(link.getAttribute("href"));
      if (!href || idFromUrl(href, "stid") !== currentStid) continue;
      const page = Number(idFromUrl(href, "page") || "0") || 0;
      if (page <= currentPage) continue;
      const label = text(link);
      const title = String(link.getAttribute("title") || "");
      const className = String(link.className || "");
      const likelyNext = /加载下一页|下一页/.test(title) || label.includes(">") || /uitxt1/.test(className) || page === currentPage + 1;
      if (likelyNext) candidates.push({ href, page });
    }
    candidates.sort((a, b) => a.page - b.page);
    nextUrl = candidates[0]?.href || "";
  }

  const normalizedSamples = samples.slice(0, maxItems).map((item) => ({
    title: String(item.title || ""),
    body: String(item.body || ""),
    url: String(item.url || ""),
    author: String(item.author || ""),
    publishedAt: String(item.publishedAt || ""),
    forumId: String(item.forumId || ""),
    topicId: String(item.topicId || "")
  }));
  return { samples: normalizedSamples, nextUrl: String(nextUrl || "") };
})()
"##
    .replace("__MAX_ITEMS__", &max_items.to_string());
    let (sender, receiver) = std::sync::mpsc::channel();
    window
        .eval_with_callback(script, move |result| {
            let _ = sender.send(result);
        })
        .map_err(|error| format!("NGA 页面招募读取脚本执行失败：{error}"))?;
    let payload = receiver
        .recv_timeout(Duration::from_secs(NGA_EVAL_TIMEOUT_SECS))
        .map_err(|_| "NGA 页面招募读取超时。".to_string())?;
    parse_eval_page_snapshot(&payload)
}

fn parse_eval_page_snapshot(payload: &str) -> Result<NgaPageSnapshot, String> {
    let first_parse: Value = serde_json::from_str(payload)
        .map_err(|error| format!("NGA 页面招募 JSON 解析失败：{error}"))?;
    let parsed = if let Some(text) = first_parse.as_str() {
        let nested: Value = serde_json::from_str(text)
            .map_err(|error| format!("NGA 页面招募 JSON 解析失败：{error}"))?;
        nested
    } else {
        first_parse
    };
    if let Some(array) = parsed.as_array() {
        return Ok(NgaPageSnapshot {
            samples: array.clone(),
            next_url: None,
        });
    }
    let Some(object) = parsed.as_object() else {
        return Err("NGA 页面招募脚本没有返回有效对象。".to_string());
    };
    let samples = object
        .get("samples")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let next_url = object
        .get("nextUrl")
        .and_then(Value::as_str)
        .and_then(|value| Url::parse(value).ok())
        .filter(is_nga_board_url);
    Ok(NgaPageSnapshot { samples, next_url })
}

fn sanitize_nga_samples(values: Vec<Value>, max_items: usize) -> Vec<Value> {
    let mut samples = Vec::new();
    let mut seen = std::collections::BTreeSet::new();
    for value in values {
        if samples.len() >= max_items {
            break;
        }
        let title = limited_clean_string(&value, "title", 500);
        let body = limited_clean_string(&value, "body", 8000);
        let url = limited_clean_string(&value, "url", 1000);
        let author = limited_clean_string(&value, "author", 200);
        let published_at = limited_clean_string(&value, "publishedAt", 120);
        let forum_id = identifier_string(&value, "forumId");
        let topic_id = identifier_string(&value, "topicId");
        let key = if !topic_id.is_empty() {
            topic_id.clone()
        } else if !url.is_empty() {
            url.clone()
        } else {
            format!("{title}:{author}")
        };
        if key.trim().is_empty() || seen.contains(&key) {
            continue;
        }
        seen.insert(key);
        samples.push(json!({
            "title": title,
            "body": body,
            "url": url,
            "author": author,
            "publishedAt": published_at,
            "forumId": forum_id,
            "topicId": topic_id
        }));
    }
    samples
}

fn limited_clean_string(value: &Value, key: &str, max_chars: usize) -> String {
    let mut text = read_string(value, key)
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ");
    if text.chars().count() > max_chars {
        text = text.chars().take(max_chars).collect();
    }
    text
}

fn identifier_string(value: &Value, key: &str) -> String {
    let text = limited_clean_string(value, key, 40);
    if text
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
    {
        text
    } else {
        String::new()
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_supported_nga_interstitial_target() {
        let url = Url::parse(
            "https://bbs.nga.cn/misc/adpage_insert_2.html?https://bbs.nga.cn/read.php?tid=46723623",
        )
        .unwrap();
        let target = extract_nga_interstitial_target(&url).unwrap();
        assert_eq!(target.as_str(), "https://bbs.nga.cn/read.php?tid=46723623");
    }

    #[test]
    fn keeps_known_board_rand_urls_supported() {
        let url = Url::parse("https://bbs.nga.cn/thread.php?stid=44366746&rand=141").unwrap();
        assert!(is_supported_nga_collect_url(&url));
    }

    #[test]
    fn normalizes_board_urls_without_volatile_parameters() {
        let url =
            normalize_nga_url("https://bbs.nga.cn/thread.php?stid=44366746&rand=321").unwrap();
        assert_eq!(url.as_str(), "https://bbs.nga.cn/thread.php?stid=44366746");

        let url = normalize_nga_url("https://bbs.nga.cn/thread.php?stid=30742942&rand=88").unwrap();
        assert_eq!(url.as_str(), "https://bbs.nga.cn/thread.php?stid=30742942");
    }

    #[test]
    fn matches_expected_collect_targets_by_board_or_topic_id() {
        let current = Url::parse("https://bbs.nga.cn/thread.php?stid=44366746&rand=321").unwrap();
        let expected = Url::parse("https://bbs.nga.cn/thread.php?stid=44366746").unwrap();
        assert!(is_same_nga_collect_target(&current, &expected));

        let other_board = Url::parse("https://bbs.nga.cn/thread.php?stid=30742918").unwrap();
        assert!(!is_same_nga_collect_target(&other_board, &expected));

        let current_topic = Url::parse("https://bbs.nga.cn/read.php?tid=46723623").unwrap();
        let expected_topic = Url::parse("https://bbs.nga.cn/read.php?tid=46723623").unwrap();
        assert!(is_same_nga_collect_target(&current_topic, &expected_topic));
        assert!(!is_same_nga_collect_target(&current, &expected_topic));
    }

    #[test]
    fn parses_board_snapshot_next_page_url() {
        let snapshot = parse_eval_page_snapshot(
            r#"{"samples":[],"nextUrl":"https://bbs.nga.cn/thread.php?stid=44366746&page=5"}"#,
        )
        .unwrap();
        assert_eq!(
            snapshot.next_url.unwrap().as_str(),
            "https://bbs.nga.cn/thread.php?stid=44366746&page=5"
        );
    }
}
