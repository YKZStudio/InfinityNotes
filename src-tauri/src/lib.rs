use base64::{engine::general_purpose::STANDARD, Engine};
use infinity_native_core::{
    atomic_json, digest, extract_verified, safe_path, verify_directory, BootState, LIMIT,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    borrow::Cow,
    fs,
    io::{Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{
    utils::assets::{AssetKey, AssetsIter, CspHash},
    Assets, Manager, Runtime,
};
#[cfg(not(target_os = "android"))]
use tauri_plugin_dialog::DialogExt;
const PUBLIC_KEY: &str = match option_env!("INFINITY_UPDATE_PUBLIC_KEY") {
    Some(v) => v,
    None => "",
};
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
struct Folder {
    uri: String,
    name: String,
}
#[derive(Default)]
struct Native {
    root: PathBuf,
    folder: Folder,
    pending: Option<Folder>,
    boot: BootState,
    active: Option<PathBuf>,
    error: Option<String>,
}
type Shared = Arc<Mutex<Native>>;
struct RuntimeAssets<R: Runtime> {
    embedded: Box<dyn Assets<R>>,
    state: Shared,
}
impl<R: Runtime> Assets<R> for RuntimeAssets<R> {
    fn get(&self, key: &AssetKey) -> Option<Cow<'_, [u8]>> {
        let s = self.state.lock().ok()?;
        if let Some(root) = &s.active {
            let name = key.as_ref().trim_start_matches('/');
            if !safe_path(name) {
                return None;
            }
            return fs::read(root.join(name)).ok().map(Cow::Owned);
        }
        drop(s);
        self.embedded.get(key)
    }
    fn iter(&self) -> Box<AssetsIter<'_>> {
        self.embedded.iter()
    }
    fn csp_hashes(&self, path: &AssetKey) -> Box<dyn Iterator<Item = CspHash<'_>> + '_> {
        self.embedded.csp_hashes(path)
    }
    fn setup(&self, app: &tauri::App<R>) {
        self.embedded.setup(app);
        let init = || -> infinity_native_core::Result<()> {
            let mut s = self.state.lock().map_err(|_| "存储锁失败")?;
            s.root = app.path().app_data_dir()?;
            fs::create_dir_all(s.root.join("releases"))?;
            let folder = s.root.join("folder.json");
            if folder.exists() {
                s.folder = serde_json::from_slice(&fs::read(folder)?)?;
            }
            let boot = s.root.join("boot.json");
            if boot.exists() {
                s.boot = serde_json::from_slice(&fs::read(&boot)?)?;
            }
            s.boot.begin();
            if let Some(id) = s.boot.active.clone() {
                if !id.chars().all(|c| c.is_ascii_hexdigit()) || id.len() != 64 {
                    return Err("无效活动资源包".into());
                }
                let path = s.root.join("releases").join(&id);
                if verify_directory(&path, PUBLIC_KEY).is_ok() {
                    s.active = Some(path)
                } else {
                    s.boot.active = None;
                    s.boot.booting = false;
                    s.boot.rejected.push(id);
                    s.error = Some("业务包损坏，已恢复内置版本".into());
                }
            }
            atomic_json(&boot, &s.boot)?;
            Ok(())
        };
        if let Err(e) = init() {
            if let Ok(mut s) = self.state.lock() {
                s.active = None;
                s.error = Some(format!("原生存储初始化失败：{e}"));
            }
        }
    }
}
#[derive(Clone)]
struct Embedded(Vec<(String, Vec<u8>)>);
fn mobile(app: &tauri::AppHandle, method: &str, args: Value) -> Result<Value, String> {
    app.state::<tauri_plugin_storage::Storage<tauri::Wry>>()
        .call(method, args)
}
fn read_at(app: &tauri::AppHandle, folder: &Folder) -> Result<Option<String>, String> {
    #[cfg(target_os = "android")]
    {
        Ok(
            mobile(app, "readWorkspace", json!({"uri":folder.uri}))?["workspace"]
                .as_str()
                .map(String::from),
        )
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let file = PathBuf::from(&folder.uri).join("wuxianji-workspace.json");
        if !file.exists() {
            return Ok(None);
        }
        let text = fs::read_to_string(&file).map_err(|e| e.to_string())?;
        if serde_json::from_str::<Value>(&text).is_ok() {
            return Ok(Some(text));
        }
        fs::read_to_string(file.with_file_name("wuxianji-workspace.backup.json"))
            .map(Some)
            .map_err(|_| "工作区损坏，请恢复备份".into())
    }
}
fn mirror(
    app: &tauri::AppHandle,
    folder: &Folder,
    version: &str,
    files: &[(String, Vec<u8>)],
) -> Result<(), String> {
    if folder.uri.is_empty() {
        return Err("请先选择存储文件夹".into());
    }
    #[cfg(target_os = "android")]
    {
        mobile(
            app,
            "writeRuntime",
            json!({"uri":folder.uri,"version":version,"files":files.iter().map(|(path,raw)|json!({"path":path,"data":STANDARD.encode(raw)})).collect::<Vec<_>>()}),
        )?;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        let dir = PathBuf::from(&folder.uri)
            .join("runtime")
            .join("releases")
            .join(version);
        for (name, raw) in files {
            if !safe_path(name) {
                return Err("无效内置资源路径".into());
            }
            let file = dir.join(name);
            fs::create_dir_all(file.parent().ok_or("资源缺少父目录")?)
                .map_err(|e| e.to_string())?;
            fs::write(file, raw).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
#[tauri::command]
fn native_status(state: tauri::State<'_, Shared>) -> Result<Value, String> {
    let s = state.lock().map_err(|e| e.to_string())?;
    Ok(
        json!({"folder":s.folder,"updateConfigured":!PUBLIC_KEY.is_empty(),"active":s.boot.active,"staged":s.boot.staged,"error":s.error,"shellApi":1}),
    )
}
#[tauri::command]
async fn choose_folder(app: tauri::AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "android")]
        let (folder, workspace) = {
            let r = mobile(&app, "pickFolder", json!({}))?;
            (
                Folder {
                    uri: r["uri"].as_str().ok_or("未选择文件夹")?.into(),
                    name: r["name"].as_str().unwrap_or("无限记").into(),
                },
                r["workspace"].as_str().map(String::from),
            )
        };
        #[cfg(not(target_os = "android"))]
        let (folder, workspace) = {
            let file = app
                .dialog()
                .file()
                .blocking_pick_folder()
                .ok_or("已取消选择")?;
            let path = file.into_path().map_err(|e| e.to_string())?;
            let folder = Folder {
                uri: path.to_string_lossy().into(),
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into(),
            };
            let data = read_at(&app, &folder)?;
            (folder, data)
        };
        app.state::<Shared>()
            .lock()
            .map_err(|e| e.to_string())?
            .pending = Some(folder.clone());
        Ok(json!({"folder":folder,"workspace":workspace}))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn confirm_folder(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let shared = app.state::<Shared>();
        let mut s = shared.lock().map_err(|e| e.to_string())?;
        let folder = s.pending.take().ok_or("没有待确认文件夹")?;
        mirror(&app, &folder, "embedded-020", &app.state::<Embedded>().0)?;
        atomic_json(&s.root.join("folder.json"), &folder).map_err(|e| e.to_string())?;
        s.folder = folder;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn read_workspace(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let s = app.state::<Shared>();
        let folder = s.lock().map_err(|e| e.to_string())?.folder.clone();
        if folder.uri.is_empty() {
            return Ok(None);
        }
        read_at(&app, &folder)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn write_workspace(app: tauri::AppHandle, data: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if data.len() > 32 * 1024 * 1024 {
            return Err("工作区过大".into());
        }
        let value: Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        let shared = app.state::<Shared>();
        let s = shared.lock().map_err(|e| e.to_string())?;
        if s.folder.uri.is_empty() {
            return Err("请选择存储文件夹".into());
        }
        #[cfg(target_os = "android")]
        {
            mobile(
                &app,
                "writeWorkspace",
                json!({"uri":s.folder.uri,"data":data}),
            )?;
        }
        #[cfg(not(target_os = "android"))]
        {
            let p = PathBuf::from(&s.folder.uri).join("wuxianji-workspace.json");
            if let Some(old) = read_at(&app, &s.folder)? {
                let prior: Value = serde_json::from_str(&old).map_err(|e| e.to_string())?;
                atomic_json(&p.with_file_name("wuxianji-workspace.backup.json"), &prior)
                    .map_err(|e| e.to_string())?;
            }
            atomic_json(&p, &value).map_err(|e| e.to_string())?;
        }
        let _ = value;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn app_ready(state: tauri::State<'_, Shared>) -> Result<(), String> {
    let mut s = state.lock().map_err(|e| e.to_string())?;
    s.boot.ready();
    atomic_json(&s.root.join("boot.json"), &s.boot).map_err(|e| e.to_string())
}
#[tauri::command]
async fn stage_update(app: tauri::AppHandle, url: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Value, String> {
        if PUBLIC_KEY.is_empty() {
            return Err("此安装包未配置更新公钥，请先配置签名构建".into());
        }
        let parsed = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
        if parsed.scheme() != "https" || parsed.username() != "" || parsed.password().is_some() {
            return Err("更新包必须使用 HTTPS 地址".into());
        }
        let shared = app.state::<Shared>();
        let mut s = shared.lock().map_err(|e| e.to_string())?;
        if s.folder.uri.is_empty() {
            return Err("请先选择存储文件夹".into());
        }
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(90))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        let mut res = client
            .get(parsed)
            .send()
            .map_err(|e| e.to_string())?
            .error_for_status()
            .map_err(|e| e.to_string())?;
        if res.content_length().unwrap_or(0) > LIMIT {
            return Err("更新包过大".into());
        }
        let mut bytes = Vec::new();
        Read::by_ref(&mut res)
            .take(LIMIT + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() as u64 > LIMIT {
            return Err("更新包过大".into());
        }
        let id = digest(&bytes);
        if s.boot.rejected.contains(&id) {
            return Err("已拒绝此失败版本".into());
        }
        let archive = s.root.join("download.zip");
        fs::write(&archive, bytes).map_err(|e| e.to_string())?;
        let target = s.root.join("releases").join(&id);
        let version = extract_verified(&archive, &target, PUBLIC_KEY, s.boot.watermark)
            .map_err(|e| e.to_string())?;
        let env: Value = serde_json::from_slice(
            &fs::read(target.join("update.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let mut files = Vec::new();
        for name in env["manifest"]["files"]
            .as_object()
            .ok_or("无效资源表")?
            .keys()
        {
            files.push((
                name.clone(),
                fs::read(target.join(name)).map_err(|e| e.to_string())?,
            ));
        }
        files.push((
            "update.json".into(),
            serde_json::to_vec(&env).map_err(|e| e.to_string())?,
        ));
        mirror(&app, &s.folder, &id, &files)?;
        s.boot.staged = Some(id);
        s.boot.watermark = version;
        atomic_json(&s.root.join("boot.json"), &s.boot).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(archive);
        Ok(json!({"version":version,"restartRequired":true}))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    let state = Arc::new(Mutex::new(Native::default()));
    let embedded = Embedded(
        context
            .assets
            .iter()
            .map(|(k, v)| (k.trim_start_matches('/').to_owned(), v.into_owned()))
            .collect(),
    );
    let inner = context.assets;
    context.assets = Box::new(RuntimeAssets {
        embedded: inner,
        state: state.clone(),
    });
    tauri::Builder::default()
        .manage(state)
        .manage(embedded)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_storage::init())
        .invoke_handler(tauri::generate_handler![
            native_status,
            choose_folder,
            confirm_folder,
            read_workspace,
            write_workspace,
            app_ready,
            stage_update
        ])
        .run(context)
        .expect("无法启动无限记");
}
