//! Business bundle verification shared by Windows and Android. No Tauri dependency.
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{pkcs8::DecodePublicKey, Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Component, Path},
};
pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
pub const LIMIT: u64 = 64 * 1024 * 1024;
pub fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn safe_path(s: &str) -> bool {
    !s.is_empty()
        && !s.contains(['\\', ':'])
        && !s.starts_with('/')
        && s.split('/').all(|p| !p.is_empty() && p != "." && p != "..")
        && Path::new(s)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
        && [
            "html", "css", "js", "mjs", "json", "png", "jpg", "jpeg", "webp", "gif", "svg",
            "woff2", "wasm", "txt",
        ]
        .contains(
            &Path::new(s)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or(""),
        )
}
pub fn atomic_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let tmp = path.with_extension("pending");
    let mut f = File::create(&tmp)?;
    f.write_all(&serde_json::to_vec(value)?)?;
    f.sync_all()?;
    drop(f);
    fs::rename(tmp, path)?;
    Ok(())
}
pub fn verify_manifest(env: &Value, public: &str, watermark: u64) -> Result<u64> {
    let m = &env["manifest"];
    let key = VerifyingKey::from_public_key_pem(public)?;
    let sig = STANDARD.decode(env["signature"].as_str().ok_or("缺少签名")?)?;
    key.verify_strict(&serde_json::to_vec(m)?, &Signature::from_slice(&sig)?)?;
    let v = m["version"].as_u64().ok_or("无效版本号")?;
    if m["format"] != "wuxianji.bundle"
        || m["schema"] != 1
        || v <= watermark
        || m["minShellApi"].as_u64().filter(|n| *n == 1).is_none()
    {
        return Err("版本或壳接口不兼容".into());
    }
    Ok(v)
}
pub fn verify_directory(dir: &Path, public: &str) -> Result<()> {
    let env: Value = serde_json::from_slice(&fs::read(dir.join("update.json"))?)?;
    verify_manifest(&env, public, 0)?;
    for (name, meta) in env["manifest"]["files"].as_object().ok_or("缺少资源")? {
        if !safe_path(name) {
            return Err("无效路径".into());
        }
        let p = dir.join(name);
        if !p.canonicalize()?.starts_with(dir.canonicalize()?) {
            return Err("资源越界".into());
        }
        let raw = fs::read(p)?;
        if meta["size"].as_u64() != Some(raw.len() as u64)
            || meta["sha256"].as_str() != Some(digest(&raw).as_str())
        {
            return Err("本地资源被修改".into());
        }
    }
    Ok(())
}
/// Destination must be a new private-cache directory. No unverified byte is executed.
pub fn extract_verified(
    archive: &Path,
    destination: &Path,
    public: &str,
    watermark: u64,
) -> Result<u64> {
    let mut zip = zip::ZipArchive::new(File::open(archive)?)?;
    if zip.len() > 10000 {
        return Err("更新资源过多".into());
    }
    let mut seen = BTreeSet::new();
    let mut size = 0u64;
    for i in 0..zip.len() {
        let f = zip.by_index(i)?;
        size = size.checked_add(f.size()).ok_or("资源大小溢出")?;
        if size > LIMIT + 2 * 1024 * 1024
            || !seen.insert(f.name().to_lowercase())
            || f.is_dir()
            || f.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
        {
            return Err("无效更新包条目".into());
        }
    }
    let mut env_bytes = Vec::new();
    zip.by_name("update.json")?
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut env_bytes)?;
    if env_bytes.len() > 2 * 1024 * 1024 {
        return Err("清单过大".into());
    }
    let env: Value = serde_json::from_slice(&env_bytes)?;
    let version = verify_manifest(&env, public, watermark)?;
    let files = env["manifest"]["files"].as_object().ok_or("缺少资源列表")?;
    if !files.contains_key("index.html") || zip.len() != files.len() + 1 || destination.exists() {
        return Err("无效业务包目录".into());
    }
    // Verify every resource before writing any payload, with bounded decompression.
    let mut verified = Vec::new();
    let mut total = 0u64;
    for (name, meta) in files {
        if !safe_path(name) {
            return Err("不安全的资源路径".into());
        }
        let mut raw = Vec::new();
        zip.by_name(&format!("payload/{name}"))?
            .take(LIMIT + 1)
            .read_to_end(&mut raw)?;
        total += raw.len() as u64;
        if total > LIMIT
            || meta["size"].as_u64() != Some(raw.len() as u64)
            || meta["sha256"].as_str() != Some(digest(&raw).as_str())
        {
            return Err("资源摘要不匹配".into());
        }
        verified.push((name, raw));
    }
    fs::create_dir_all(destination)?;
    for (name, raw) in verified {
        let path = destination.join(name);
        fs::create_dir_all(path.parent().ok_or("无效目录")?)?;
        fs::write(path, raw)?;
    }
    fs::write(destination.join("update.json"), env_bytes)?;
    Ok(version)
}
#[derive(Default, Clone, Serialize, Deserialize, Debug)]
#[serde(default)]
pub struct BootState {
    pub active: Option<String>,
    pub previous: Option<String>,
    pub staged: Option<String>,
    pub booting: bool,
    pub watermark: u64,
    pub rejected: Vec<String>,
}
impl BootState {
    pub fn begin(&mut self) {
        if self.booting {
            if let Some(bad) = self.active.take() {
                self.rejected.push(bad);
            }
            self.active = self.previous.take();
            self.booting = false;
        }
        if let Some(next) = self.staged.take() {
            self.previous = self.active.take();
            self.active = Some(next);
            self.booting = true;
        }
    }
    pub fn ready(&mut self) {
        self.booting = false;
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths() {
        for p in [
            "../x.js",
            "a/../x.js",
            "C:/x.js",
            "x\\y.js",
            "/x.js",
            "a//x.js",
            "x.exe",
        ] {
            assert!(!safe_path(p));
        }
        assert!(safe_path("assets/app.mjs"));
    }
    #[test]
    fn rollback() {
        let mut b = BootState {
            active: Some("old".into()),
            staged: Some("bad".into()),
            watermark: 2,
            ..Default::default()
        };
        b.begin();
        assert_eq!(b.active.as_deref(), Some("bad"));
        assert!(b.booting);
        b.begin();
        assert_eq!(b.active.as_deref(), Some("old"));
        assert_eq!(b.watermark, 2);
        assert_eq!(b.rejected, vec!["bad"]);
    }
    #[test]
    fn ready_commits() {
        let mut b = BootState {
            staged: Some("good".into()),
            ..Default::default()
        };
        b.begin();
        b.ready();
        b.begin();
        assert_eq!(b.active.as_deref(), Some("good"));
        assert!(!b.booting);
    }
}
