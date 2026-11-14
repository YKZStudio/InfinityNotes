# 无限记 · InfinityNotes

面向 **Windows 10+** 与 **Android 12+ 手机/平板**的无限画板，采用液态玻璃风格。仅应用内提供英文 26 键及中英语音输入；个人跨设备同步优先，多人协作延后。所有自写源码保存在本仓库。

**当前为 0.2 开发预览工程，完整无边记功能对齐尚未完成。原生构建、录音、更新和设备适配须以实际构建/真机记录为准。** 计划通过本仓库 Releases（发行版）提供 Windows 安装程序与 Android APK，不上架应用商店。

## 现有能力

基础无限画布、便笺、文字、图形、手绘、图片、网页链接、对象属性、撤销/重做、场景导航、导入导出、主题及首次设置。个人同步服务提供持久化、鉴权和版本冲突保护。

本次接入 Tauri 2（跨平台原生外壳）、Windows 目录选择、Android SAF（存储访问框架）、自选文件夹保存与备份、业务资源导出，以及原生签名更新/启动回退代码。没有配置更新公钥时更新入口保持禁用。原生系统能力更新仍需要升级安装包。

离线语音使用 Vosk/WASM（浏览器离线推理），需要导入中文或英文模型；服务器语音使用可选 faster-whisper（语音识别引擎），需要自己的服务器模型。两个入口均已编写，尚未完成真实录音识别验收。模型文件向外置原生目录的自动迁移仍待补全。

## 本地运行画板

需要 Python 3.10+；如需离线语音组件，还需要 Node.js 22+。

```bash
npm ci
python3 server/app.py
```

浏览器打开 `http://127.0.0.1:8787`。Windows 可将 `python3` 换成 `py -3`，或使用启动脚本。纯画板不依赖前端框架，不使用云服务也可以编辑。正式原生客户端首次使用要求选择存储文件夹。

## 原生构建

先按 Tauri 官方前置条件安装 Rust、Windows C++ 工具链/WebView2，或 Android SDK/NDK/JDK。Windows 构建：

```bash
npm ci
npx tauri icon artwork/icon.svg
npx tauri build -- --locked
```

Android（需配置 Android SDK 与 NDK_HOME）：

```bash
npm ci
npx tauri android init --ci
npx tauri icon artwork/icon.svg
npx tauri android build --debug --apk --target aarch64
```

自动流程见 `.github/workflows/build.yml`。普通提交先运行测试再构建；明确含 `[release]` 的提交仅在两个原生构建均成功后发布标为开发预览的 GitHub 发行版。Android 当前使用调试签名，长期发布需另配置稳定签名密钥。

## 离线语音模型

从 [Vosk 官方模型页](https://alphacephei.com/vosk/models) 选择中文或英语的轻量模型，保留其许可证。用下面工具转换官方 ZIP 为浏览器推理需要的目录格式：

```bash
python3 tools/pack_model.py 已下载模型.zip model.tar.gz
```

在无限记设置中选择对应语言、导入 `model.tar.gz`，选择“离线模型”，启用语音后在文字编辑窗开始识别。首次导入占用较多空间，模型默认留在本机缓存；尚未完成外置模型迁移。服务器识别配置见部署说明。退出文字编辑会取消录音，服务器模式停止录音后才上传。

## 测试

```bash
npm test
python3 -m pip install cryptography
python3 -m unittest discover -s tests -p 'test_*.py' -v
cargo test --manifest-path native-core/Cargo.toml --locked
```

`tests/browser-check.cjs` 用于浏览器交互回归。语音模型识别、Windows/Android 真机与大画布性能是独立验收项，不能由逻辑单元测试替代。

## 文档与范围

- [已确认的需求](docs/DECISIONS.md)
- [ECS 部署与签名更新](docs/DEPLOYMENT.md)
- [最初功能矩阵与开发范围](docs/开发规格与决策.md)（历史决策以 DECISIONS.md 为准）
- [服务接口](docs/API.md)
- [开发预览说明](docs/PREVIEW-RELEASE.md)

尚待完成：完整多选/分组/吸附、动态连线、富文本、表格/图表、媒体/PDF 预览与导出、回收站、手写笔压感及掌触抑制、正式签名与真机验收。多人协作延后；AI 扩展、Apple 原始文件互通暂不包含。

服务访问密钥、语音模型、签名私钥和服务器配置不提交仓库。仓库采用原有 MIT 许可证；第三方依赖和模型遵循各自许可证，Vosk-Browser 声明保存在 `third_party/`。
