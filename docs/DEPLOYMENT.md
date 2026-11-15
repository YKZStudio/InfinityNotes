# ECS 部署准备

目标：`notes.yakezhou.asia`，Alibaba Cloud Linux 4 LTS x64。资源暂按 2 vCPU、4 GB 内存、80 GB 磁盘。尚未连接或修改真实服务器。

先在 ECS 上检查系统和现有 Docker（容器引擎），不要重复安装：

```bash
cat /etc/os-release
docker --version
docker compose version
sudo systemctl status docker --no-pager
```

如果 Docker 或 Compose 命令不存在，按阿里云针对当前系统的官方安装说明配置后继续。避免套用其他发行版的安装脚本。

## 个人同步与更新分发

确认 Docker Engine（容器引擎）与 Compose（容器编排工具）可用后，把本仓库拉到自己的部署目录。

```bash
cp deploy/.env.example deploy/.env
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

`deploy/.env.example` 已填写 `INFINITY_DOMAIN=notes.yakezhou.asia`。在 `deploy/.env` 中填写刚生成的访问密钥。请不要提交 `.env`。把子域名的 A 记录指向 ECS 公网地址，开放 TCP 80/443。Docker 代理会处理 HTTPS 证书，应用的 8787 端口不直接发布到公网。

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
```

默认镜像不包含大模型。客户端填入 `https://notes.yakezhou.asia`，使用同一私人密钥进行手动跨设备同步。现有服务是个人共享工作区，不能当成多用户服务。

在销毁或重装服务器前备份 `infinity-data` 命名卷；停止写入后备份，或使用 SQLite backup（数据库在线备份接口）得到一致的数据库副本。恢复操作先在测试目录验证，不直接覆盖唯一副本。

## 服务器语音（可选）

`deploy/Dockerfile.speech` / `compose.speech.yml` 提供可选的 CPU（中央处理器）推理镜像。模型不随仓库下载，也不在客户端第一次使用时偷偷下载到服务器。

先准备已转换为 CTranslate2 格式的多语言 Whisper tiny 或 base 模型到 ECS 上的目录，例如 `/opt/infinity-models/tiny`，需要包含 `config.json`、`model.bin`、`tokenizer.json` 等完整文件。`deploy/requirements-speech.txt` 锁定推理库版本。模型自身许可证要随模型保留。

在 `.env` 添加：

```text
INFINITY_MODELS_DIR=/opt/infinity-models
WUJI_ASR_MODEL=/models/tiny
```

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml -f deploy/compose.speech.yml up -d --build
```

目前单并发、最多 60 秒录音、2 个 CPU 线程、int8（8 位整数运算）。同步与推理共用此 ECS，**不能据此承诺实时速度**；需要用你的服务器实测延迟、内存及磁盘占用。应用给语音服务留 2.5 GB 内存上限，若模型不合适应改用更小模型或拆分服务。

## 业务热更新

自己保管 Ed25519 私钥；公钥为非秘密信息，可以放在 GitHub 仓库变量 `INFINITY_UPDATE_PUBLIC_KEY` 中。它必须是完整 PEM 文本；Actions 构建时会把公钥固定进原生壳。没有配置公钥的构建会禁用业务更新。

使用 `tools/release.py` 生成和验证签名资源包。必须先 `npm ci`，确保离线推理 JS 依赖已复制到 `client/vendor`，再对完整 `client` 构建业务包。不得把私钥提交仓库或打进 APK。

将经过验证的包及 `latest.json` 发布到应用数据卷的 `releases` 目录。应用设置中的“检查业务更新”读取 `/api/releases/latest`，原生壳下载实际包并二次验签。更新暂存成功后关闭并重开应用；新业务脚本成功启动后调用健康确认，若没有确认则再启动时回退。

当前更新器拒绝 HTTP 和重定向地址，避免无意改变下载来源；ECS 直接提供 HTTPS 包地址即可。版本序号必须严格递增。此阶段没有跨 schema 的数据迁移协议；不要用热更新修改 schema，待迁移与数据恢复完成后再开放。

原生权限、桥接、推理库、Android 系统组件等变化仍需升级安装包。原生 APK 长期升级需要你自己持有稳定签名密钥；调试签名包仅供开发预览。

## 真正部署前需要的信息

子域名和系统已确认；Docker 是否可用仍需用上面的命令检查。直接部署还需要可操作的服务器连接，目前尚未提供。不要在聊天里发 SSH 密码、私钥或令牌。

启动后检查：

```bash
docker compose --env-file deploy/.env -f deploy/compose.yml ps
curl --fail https://notes.yakezhou.asia/api/health
```

健康检查应返回 JSON（数据对象）；同步接口仍需访问密钥。客户端只在主动同步/下载/语音操作时连接服务，示例域名不会自动启用录音或上传。
