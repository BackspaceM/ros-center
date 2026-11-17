# ROS Center · RouterOS 管理中心

> 一个轻量、零运行时依赖的 RouterOS 多设备管理中心：实时流量、分类配置、双语界面、多主题，全部装进一个 Docker 镜像。
> A lightweight, dependency-free RouterOS control center: live traffic, categorized config management, bilingual UI, 10 themes — all in one Docker image.

[中文](#中文文档) · [English](#english)

---

## 中文文档

### 简介

ROS Center 通过 RouterOS API（8728 / 8729）只读取实时数据，并按需写入配置。它不占用路由器 CPU，不需要在 RouterOS 里安装任何脚本或容器；部署在局域网任意常开设备（小主机、NAS、VM、LXC）即可同时管控多台 RouterOS。

- **后端**：Node.js 内置模块实现，无 npm 运行时依赖
- **前端**：原生 HTML/CSS/JS，Canvas 绘图 + WebSocket 实时推流
- **数据**：每台设备独立连接、历史、配置缓存与日志，互不串台

### 功能亮点

- **多设备管控**：顶栏下拉切换；设备增删改查、测试连接、设为主设备、重连；配置持久化到 `data/devices.json`
- **实时流量**：实时流量来自 RouterOS 原生 `monitor-traffic` 流式监听（设备每秒主动推送，无需反复查询）；总下载/上传/活跃接口/峰值卡片、双曲线趋势图、接口列表与迷你趋势、连接排行
- **连接状态**：真实读取 RouterOS 连接表，分别统计 IPv4 / IPv6 / 汇总（每 5 秒刷新），趋势图展示总数与双栈历史；另设 IPv4、IPv6 两个连接明细分类

流式监听不可用时（旧版 RouterOS 或网络限制）自动回退到轮询，并每 10 秒重试一次恢复流式。可用 `TRAFFIC_STREAM=0` 强制只用轮询。
- **分类配置**：9 组 44 个分类，接口、IP、DHCP、DNS、路由、防火墙 IPv4/IPv6（Filter/NAT/Mangle/地址列表/服务端口）、WiFi、PPP、WireGuard、队列、用户、系统服务、计划任务、脚本等，支持新增/编辑/启用/禁用/删除/搜索/表头排序/分页；RouterOS 的十六进制 `.id` 显示为十进制序号
- **WireGuard 扫码添加**：行内扫码按钮打开 WinBox 风格对端表单（名称、接口、私钥可手填或一键生成、公钥、Endpoint/端口、允许地址、预共享密钥、持久保活、responder 等），实时生成客户端配置二维码，可保存回 RouterOS、复制或下载 `.conf`
- **中英双语**：右上角一键切换，界面、表单、提示、错误全部双语
- **10 套主题**：跟随系统、浅色、深色、毛玻璃、青花瓷、液态玻璃、极光、深海、樱粉、黑白极简；图表与 SVG 同步换色
- **侧栏折叠**：分组整体折叠/展开、单个分组折叠、侧栏收窄为图标条、拖动调整宽度
- **WebUI 登录页**：会话 Cookie 登录页 + 侧栏退出按钮；也可在「系统管理 → 设备管理 → 安全建议」里直接设置账号密码（哈希存 `data/auth.json`）。原有 `WEB_USER` / `WEB_PASSWORD` Basic 认证继续兼容

### 页面展示

**仪表盘**（卡片、双折线图、设备健康、TOP 排行，顶栏可切换设备）

![仪表盘](docs/screenshots/dashboard.png)

**设备管理**（新增/编辑/测试连接/设为主设备/重连/删除，WebUI 端口设置）

![设备管理](docs/screenshots/devices.png)

**设备管理 · 英文 + 深色主题**

![设备管理英文深色](docs/screenshots/devices-dark-en.png)

**分类配置表格**（防火墙规则，行内启禁用/编辑/删除）

![防火墙规则](docs/screenshots/firewall.png)

**WireGuard 扫码添加**（二维码实时生成，配置可复制/下载）

![WireGuard 二维码](docs/screenshots/wireguard-qr.png)

**液态玻璃主题**

![液态玻璃](docs/screenshots/theme-liquid.png)

**分组折叠导航**（每组带数量，默认只展开当前分组）

![导航](docs/screenshots/navigation.png)

### 快速开始

#### 方式一：Docker Hub 镜像（推荐）

```bash
mkdir -p ros-center && cd ros-center
docker run -d --name ros-center --restart unless-stopped \
  -p 10086:10086 \
  -v "$PWD/data:/app/data" \
  backspacem/ros-center:latest
```

打开 `http://小主机IP:10086`，进入 **系统管理 → 设备管理**，添加 RouterOS 即可。无需写 `.env`。

#### 方式二：Docker Compose

```bash
git clone https://github.com/BackspaceM/ros-center.git
cd ros-center
cp .env.example .env
# 如需改端口：WEB_PORT=8080 CONTAINER_PORT=10086（默认两者均为 10086）
# 默认直接拉取 Docker Hub 官方镜像 backspacem/ros-center:latest：
docker compose up -d
# 如需用本地源码构建，则改用：docker compose up -d --build
```

首次启动建议保持 `DEMO_MODE=1` 先看界面，然后在网页里新增真实设备并关闭演示模式。

#### 方式三：本机直接运行

```bash
git clone https://github.com/BackspaceM/ros-center.git
cd ros-center
node server.js          # Node.js 18+，无需 npm install
```

### 配置方法

**方法 1（推荐）：WebUI 设备管理页**

系统管理 → 设备管理 → 新增设备：填写名称、地址、端口、账号、密码、API-SSL、演示模式 → 先点「测试连接」→ 保存。每台设备独立保存，配置写入 `./data/devices.json`（权限 0600，密码不会回显到前端）。

**方法 2：`.env` 环境变量（仅作为第一台设备的初始值）**

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WEB_PORT` | `10086` | 宿主机访问端口 |
| `CONTAINER_PORT` | `10086` | 容器内监听端口，改完需同步修改 compose 端口映射并重启 |
| `ROS_HOST` | `192.168.88.1` | 第一台 RouterOS 地址 |
| `ROS_PORT` | `8728` | API 端口；API-SSL 用 `8729` |
| `ROS_TLS` | `0` | `1` 启用 API-SSL |
| `ROS_USER` / `ROS_PASSWORD` | `monitor` / 空 | RouterOS 账号密码 |
| `TRAFFIC_STREAM` | `1` | `1` 使用 RouterOS 原生 monitor 流式推送；`0` 强制轮询回退 |
| `TRAFFIC_STREAM_RETRY_MS` | `10000` | 流式断开后重试间隔（毫秒） |
| `POLL_INTERVAL_MS` | `1000` | 轮询/系统资源刷新间隔（毫秒，最低 500） |
| `CONN_POLL_INTERVAL_MS` | `5000` | 连接数统计刷新间隔（毫秒，最低 3000） |
| `HISTORY_POINTS` | `180` | 图表保留点数 |
| `DEMO_MODE` | `0` | `1` = 强制演示数据，不连路由器 |
| `DOCKER_IMAGE` | `backspacem/ros-center:latest` | compose 使用的镜像名 |
| `WEB_USER` / `WEB_PASSWORD` | 空 | 可选 WebUI 登录账号密码（Basic Auth 兼容）；也可在网页「设备管理 → 安全建议」中设置，优先级更高 |

网页里保存的配置（`data/devices.json`、`data/auth.json`）优先级高于 `.env`。登录会话写在 `data/session.secret` 签名的 HttpOnly Cookie 中，7 天有效；侧栏 `⎋` 退出。关闭登录保护会写入 `{"disabled": true}` 到 `data/auth.json`。

**RouterOS 侧准备**（建议用只读账号）：

```routeros
/user group add name=webui policy=read,api
/user add name=webui group=webui password=改成强密码
/ip service set api address=10.0.0.0/24
/ip firewall filter add chain=input protocol=tcp dst-port=8728 src-address=10.0.0.0/24 action=accept place-before=0
```

### 使用提示

- 顶栏设备下拉切换当前查看的路由器；`?device=<ID>` 或 `?dev=<设备名>` 可深链直达指定设备
- `?section=firewallFilter` 直跳分类（`?section=firewall6Filter` 为 IPv6 过滤）；`?action=add` 打开新增表单；`?action=wgqr` 打开 WireGuard 扫码弹窗
- 表格点任意表头切换升序/降序；`ID` 列显示 RouterOS 十六进制 `.id` 对应的十进制序号，鼠标悬停可看原始 `.id`
- DNS/设备标识/时钟/NTP 为单例配置，以参数卡片展示，点「编辑」直接修改
- `?lang=en` 英文；`?theme=liquid`、`?theme=dark` 等指定主题；`?collapse=1` 折叠侧栏
- 写操作走「路径白名单 + 字段白名单」双重校验，危险操作需二次确认，所有写操作记录到日志

### 安全提醒

默认 API（8728）是明文，只在可信内网使用，并用防火墙限制来源 IP；公网环境请启用 API-SSL（8729）并配置证书。若需要写配置，请单独建一个仅授权必要菜单的 RouterOS 用户，不要用 full 权限账号。WebUI 暴露到公网前请在「设备管理 → 安全建议」里启用登录密码（或设置 `WEB_USER` / `WEB_PASSWORD`），并前置 HTTPS 反向代理。

---

## English

### Overview

ROS Center is a lightweight RouterOS control center with zero runtime npm dependencies. It reads live data and writes configuration through the RouterOS API (8728/8729). Nothing runs on the router itself — deploy it on any always-on device in your LAN (mini PC, NAS, VM, LXC) and manage multiple routers from a single dashboard.

- **Backend**: Node.js built-in modules only
- **Frontend**: vanilla HTML/CSS/JS, Canvas charts + WebSocket streaming
- **Data**: per-device connection, history, config cache and logs — fully isolated

### Features

- **Multi-router management**: switch devices from the top bar; add/edit/delete, test connection, set primary, reconnect; persisted in `data/devices.json`
- **Live traffic**: powered by RouterOS native `monitor-traffic` streaming (the device pushes a fresh sample every second, no repeated polling); download/upload/active ports/peak cards, dual-line charts, per-interface mini sparklines, connection ranking
- **Connection status**: reads the real RouterOS connection table and reports IPv4 / IPv6 / total counts separately (refreshed every 5s), with a dual-stack history chart; separate IPv4 and IPv6 connection detail sections

If streaming is unavailable (older RouterOS or restricted networks), the app falls back to polling and retries streaming every 10 seconds. Set `TRAFFIC_STREAM=0` to force polling.
- **Categorized config**: 9 groups, 44 sections — interfaces, IP, DHCP, DNS, routes, separate IPv4/IPv6 firewall (filter/NAT/mangle/address lists/service ports), WiFi, PPP, WireGuard, queues, users, services, schedules, scripts — with add/edit/enable/disable/delete/search/column sorting/pagination. RouterOS hex `.id` values are shown as decimal sequence numbers
- **WireGuard QR**: in-row scan button opens a WinBox-style peer form (name, interface, private key with one-click generation, public key, endpoint/port, allowed address, preshared key, persistent keepalive, responder...), generates a client QR, saves back to RouterOS, and copies/downloads `.conf`
- **Bilingual UI**: one-click Chinese/English switch across labels, forms, hints and errors
- **10 themes**: system, light, dark, glass, porcelain, liquid glass, aurora, ocean, sakura, mono — charts and SVGs follow the theme
- **Collapsible sidebar**: collapse groups or the whole sidebar, drag to resize
- **WebUI sign-in page**: session-cookie login page and sidebar sign-out; set credentials in "System → Devices → Security tip" (hashed in `data/auth.json`). Legacy `WEB_USER` / `WEB_PASSWORD` Basic auth still works

### Screenshots

| Page | Preview |
| --- | --- |
| Dashboard | ![Dashboard](docs/screenshots/dashboard.png) |
| Device manager | ![Devices](docs/screenshots/devices.png) |
| Device manager (EN / dark) | ![Devices EN dark](docs/screenshots/devices-dark-en.png) |
| Firewall rules | ![Firewall](docs/screenshots/firewall.png) |
| WireGuard QR | ![WireGuard QR](docs/screenshots/wireguard-qr.png) |
| Liquid glass theme | ![Liquid glass](docs/screenshots/theme-liquid.png) |
| Collapsible navigation | ![Navigation](docs/screenshots/navigation.png) |

### Quick start

**Docker Hub image (recommended):**

```bash
mkdir -p ros-center && cd ros-center
docker run -d --name ros-center --restart unless-stopped \
  -p 10086:10086 \
  -v "$PWD/data:/app/data" \
  backspacem/ros-center:latest
```

Then open `http://<host-ip>:10086` and go to **System → Devices** to add your RouterOS. No `.env` editing required.

**Docker Compose:**

```bash
git clone https://github.com/BackspaceM/ros-center.git
cd ros-center
cp .env.example .env
# Pulls the official image backspacem/ros-center:latest by default:
docker compose up -d
# Use local source build instead: docker compose up -d --build
```

**From source:**

```bash
git clone https://github.com/BackspaceM/ros-center.git
cd ros-center
node server.js      # Node.js 18+, no npm install needed
```

### Configuration

**Recommended — Web UI:** System → Devices → Add. Fill name, host, port, username, password, TLS and demo mode, click **Test connection**, then save. Each device is stored independently in `data/devices.json` (mode 0600; passwords are never returned to the browser).

**Alternative — `.env` / environment variables** (initial values for the first device only):

| Variable | Default | Description |
| --- | --- | --- |
| `WEB_PORT` | `10086` | Host-side port |
| `CONTAINER_PORT` | `10086` | Container listen port; update the compose port mapping and restart to apply |
| `ROS_HOST` | `192.168.88.1` | First RouterOS address |
| `ROS_PORT` | `8728` | API port; use `8729` for API-SSL |
| `ROS_TLS` | `0` | `1` enables API-SSL |
| `ROS_USER` / `ROS_PASSWORD` | `monitor` / empty | RouterOS credentials |
| `TRAFFIC_STREAM` | `1` | `1` uses native RouterOS monitor streaming; `0` forces polling fallback |
| `TRAFFIC_STREAM_RETRY_MS` | `10000` | Retry interval in ms after a stream drops |
| `POLL_INTERVAL_MS` | `1000` | Polling / system resource refresh interval in ms (min 500) |
| `CONN_POLL_INTERVAL_MS` | `5000` | Connection count refresh interval in ms (min 3000) |
| `HISTORY_POINTS` | `180` | Chart history points |
| `DEMO_MODE` | `0` | `1` forces demo data |
| `DOCKER_IMAGE` | `backspacem/ros-center:latest` | Image used by compose |
| `WEB_USER` / `WEB_PASSWORD` | empty | Optional WebUI sign-in (legacy Basic auth compatible); can also be set under "Devices → Security tip", which takes precedence |

Settings saved in the Web UI take precedence over `.env`.

**RouterOS preparation** (read-only user recommended):

```routeros
/user group add name=webui policy=read,api
/user add name=webui group=webui password=change-me
/ip service set api address=10.0.0.0/24
/ip firewall filter add chain=input protocol=tcp dst-port=8728 src-address=10.0.0.0/24 action=accept place-before=0
```

### Tips

- Deep links: `?device=<ID>` / `?dev=<name>`, `?section=firewallFilter` (or `firewall6Filter` for IPv6), `?action=add`, `?action=wgqr`, `?lang=en`, `?theme=liquid`, `?collapse=1`
- Click any column header to toggle ascending/descending sort; the ID column shows the decimal form of RouterOS hex `.id` (hover for the raw value)
- DNS / identity / clock / NTP are singleton settings shown as parameter cards — click Edit to change
- Writes are constrained by path and field allowlists; destructive actions require confirmation and are logged.

### Security

Plain API (8728) is unencrypted — restrict it to a trusted LAN with firewall rules, or enable API-SSL (8729) with a proper certificate. Use a dedicated least-privilege RouterOS user for writes. Enable a WebUI login password under "Devices → Security tip" (or via `WEB_USER` / `WEB_PASSWORD`) and put an HTTPS reverse proxy in front before exposing it to the internet.
