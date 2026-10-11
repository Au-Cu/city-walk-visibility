# 城市漫步 · 看见更多

全球城市真实地图原型，东京只是示例。输入起点、零至八个按顺序经过的途经点和终点，在真实 OSM 步行路网上生成候选，使用真实建筑轮廓计算二维视线遮挡，并按全程去重可见地面面积选路。地图点击、坐标输入、拖拽标记、绕行预算、两轴投影回头、重复路段限制、前向/环视、当前视域预览、GeoJSON 导出均可用。新增城市筛选、任意坐标跳转、浏览器定位、本地 Overpass JSON 导入、计算 ETA 及独立 Cloudflare 公网部署。

公网入口：[城市漫步 · Cloudflare Pages](https://city-walk-visibility.pages.dev/)。源码：[Au-Cu/city-walk-visibility](https://github.com/Au-Cu/city-walk-visibility)。

## 第一批 10 城与覆盖范围

内置的是真实**局部城区**数据包，不是城市全境。范围内可以自己重设起点、途经点、终点，不限于示例路线。城市范围外、其他城市或这些城市的数据包边界外，按需请求真实地图服务，或导入真实 OSM 数据。没有数据时明确报错，不生成虚构街区、直线替代路或无遮挡面积冒充建筑视域。

| 城市 | 已内置的真实城区 |
| --- | --- |
| 东京 | 浅草—隅田川—押上 |
| 首尔 | 明洞—清溪川—钟路 |
| 札幌 | 薄野—大通公园—札幌站南侧 |
| 伦敦 | 科文特花园—泰晤士河北岸 |
| 阿姆斯特丹 | 运河带—水坝广场 |
| 巴黎 | 玛黑区—塞纳河 |
| 纽约 | 下曼哈顿—翠贝卡 |
| 杭州 | 西湖东岸—吴山—河坊街 |
| 新加坡 | 市政区—新加坡河 |
| 京都 | 三条—鸭川—祇园 |

每个原始 JSON 保留 OSM ID、数据时间、边界、来源和 ODbL 许可，位于 `public/data/`。城市快捷入口不等于完整数据覆盖声明。全球坐标逻辑支持东西、南北半球；当前局部计算区域最多 40 km²，纬度 ±85° 内，不支持跨日期变更线路线。`scripts/check-cities.mjs` 在各城市真实路网与建筑上进行完整候选优化检查。

## Cloudflare 公网部署

默认部署到项目独立的 **Cloudflare Pages** 地址，不注册账号级 `workers.dev` 后缀，不依赖 ChatGPT 登录或 Sites 私有访问网关。`cloudflare/pages/wrangler.jsonc` 声明 Pages 项目，`scripts/build-pages.mjs` 将 `public/` 和同源地图 API 打包到 `cloudflare/pages/.pages-output/`，与原 Sites 构建相互隔离。`_routes.json` 只让 `/api/*` 调用 Functions；静态数据直接由 Pages 提供。路由计算仍在浏览器 Web Worker 中，不需要创建付费数据库或存储桶。

```powershell
npm ci
npx wrangler login
npx wrangler pages project create city-walk-visibility --production-branch main --compatibility-date 2026-05-22
npm run cf:dev
npm run cf:deploy
```

创建项目只需执行一次；已有本项目时直接部署。部署返回项目的 `pages.dev` 地址和该次版本地址。自行部署到其他账户时，先修改 Pages 配置中的 `name`，不要覆盖同名的无关项目。Windows ARM 必须使用 x64 Node 运行 Wrangler；兼容日期锁定在本项目已测试的 2026-05-22 运行时。后续可在 Cloudflare 添加自己的域名。本次使用 Direct Upload；GitHub 推送不会自动触发部署，更新后需要执行 `npm run cf:deploy`。

`cf:dev` 用共用 Worker 入口在本机预览相同的前端和地图 API，以绕开 Wrangler 4.92 的 Pages 本地资产与 Vinext 重定向冲突；它不创建线上 Worker。`cf:deploy` 仍只发布到 Pages。

公共地图接口只适合小规模试验，不保证可用性。要稳定支持城市内任意区域，需接入自建或获得授权的专用 Overpass 数据后端：

```powershell
npx wrangler pages secret put OVERPASS_ENDPOINT --project-name city-walk-visibility
npx wrangler pages secret put OVERPASS_API_KEY --project-name city-walk-visibility
```

第二项仅在后端需要 Bearer API Key 时设置；不要将地址里的凭证或 Key 写入源码。服务器端配置的专用地址不会暴露给前端。自动模式优先使用已配置的专用后端；未配置时依次尝试公共服务。代理限制区域、缓存公共地理数据一小时、不转发访客凭证；公网 Worker 另有同源检查和每个实例内每 IP 每分钟 6 次的尽力限流（不是分布式全局配额）。不默认启用付费资源或购买数据服务。

保留可选的 Workers + Static Assets 配置 `wrangler.public.jsonc` 和 `cf:worker:*` 脚本，供已有 Worker 域名的账户自行使用；它不是本项目当前的发布方式。两种部署复用 `cloudflare/worker.js` 和 `server/data-proxy.mjs`，不维护两套不同的地图逻辑。

也可导入包含道路标签、建筑、多边形成员及完整引用节点的 Overpass JSON（不是 GeoJSON/XML）。文件只在浏览器解析，不上传；上限 25 MiB。已有 `metadata.bounds` 时以它作为查询区域，缺省时从节点推断。超大区域需先裁切，缺建筑轮廓时拒绝可靠遮挡优化。浏览器保留最多 5 个自定义区域，缓存两天；内置数据按城市单独加载，不一次下载全部城市。

## 运行

本地轻量预览只需要 Node.js 18+，不需要 API Key，也不需要安装 npm 依赖。完整托管构建使用 Sites/Vinext，需要 Node.js 22.13+ 和 npm 依赖；Windows ARM 需使用 x64 Node 的兼容运行环境构建。

```powershell
git clone https://github.com/Au-Cu/city-walk-visibility.git
cd city-walk-visibility
node scripts/serve.mjs
```

打开 http://127.0.0.1:4173 。首次加载后会自动计算东京示例。切换城市后点击计算，按需加载该城市真实数据包；范围外通过同源 `/api/map-data` 代理加载真实道路与建筑。代理采用 Private.coffee / VK Maps 的 Overpass 服务，发送明确的应用标识，不转发访客 Cookie 或令牌。公共接口繁忙时可稍后重试或导入数据。底图失败时，真实路网与建筑仍能显示。

```powershell
node --test tests/*.test.mjs
node scripts/fetch-data.mjs
```

第二条命令刷新真实东京快照与 Leaflet 本地资源，正常使用不需要执行。其他内置城区可手动运行 `node scripts/fetch-city.mjs <city-id> --endpoint <获授权的 HTTPS Overpass 地址>`；一次性数据提取与运行时后端分开，禁止将 Overpass 主服务接成本站自动后端。遇到限流或超时先等待，脚本最多自动重试一次，不并发抓取或拼接全球数据。

完整 Sites 托管构建可执行 `npm ci` 和 `npm run build`；`npm run dev:lite` 是上述无依赖预览的快捷方式。`.openai/hosting.json` 中的项目标识对应原作者的私有 Sites 项目，访问权限不随 Cloudflare 发布改变；自行部署 Sites 时需使用自己的项目配置。Pages 部署不使用该标识。

## 途经点与计算时间

途经点可全部删除，也可以逐个添加，最多 8 个。每个点支持坐标输入、地图选点和拖动地图标记；用上下箭头调整途经顺序。添加后未填写的点需补齐或删除，程序不会悄悄忽略它。地图编号、最短参考、绕行预算和视域覆盖都按整条有序路线重新计算。必经点要求与不重复/回头限制冲突时明确报错，不自动删除点或放宽约束。

计算时显示已用时。ETA 优先根据正在评估的候选速度滚动更新，也参考这个浏览器近期相同城市、点数及视野设置的实测计算耗时。首次计算前期、加载数据及等待外部地图服务时可显示“剩余时间未知/评估中”；估算不是完成时间承诺。历史只保存在本地浏览器，不上传。完成后路线详情显示总计算耗时，取消或失败后停止计时。

两个及以上途经点采用限宽组合搜索，标准模式每阶段最多保留 1,024 个部分路线，精细模式 2,048 个；避免按途经点数量指数枚举全部路径。保留的完整候选仍严格检查绕行、投影回头与重复约束。限宽发生时界面标注“限宽搜索”，仍不保证全局最优。

## 数据与计算

- 快照：浅草—隅田川—押上，纬度 35.701–35.723，经度 139.786–139.821。原始 Overpass JSON 保留 OSM 节点/道路 ID 与数据时间，见 `public/data/tokyo-asakusa.json`。实际计数由加载后的界面显示。
- 基线：按途经顺序连接最短合法步行路径，得到 L0。总长度不超过 `(1+绕行比例)×L0`。忽略机动车单向规定，遵守显式 `oneway:foot`；排除无步行许可的 private/no、机动车专用路、施工路等。
- 候选：最短路径、不同局部路径成本和开阔候选观察点的插入路线。所有连接必须来自原始 OSM 图边；候选组合后按总预算、两轴投影回头和物理路段重复过滤。
- 两轴：以道路长度加权的四倍方向角推断主街道轴；低置信度时用东西/南北轴。每两个必经点之间计算 `C=½Σ_j(Σ_i|Δr_i·e_j|−|D·e_j|)`，再加总。该指标依赖轴的选择，不保证所有两两道路方向都平行或正交。
- 视域：建筑轮廓边界作为不透明障碍。射线在空间索引中寻找最近建筑交点，补充建筑角点方向，设置有限视距和前向扇形。建筑内的观察点按无室外视野处理。建筑多边形的内孔保留。
- 覆盖：沿路线采样、把视域栅格化，并以位集合求并集；建筑内部从奖励地面中排除。默认观察间距 28 米、栅格 15 米；精细模式 15 米/10 米，过大区域自动提高栅格尺寸，界面显示实际尺寸。
- 评分：满足约束的已评估候选中，选择并集面积最大的路线；面积相同时优先少回头、再优先短距离。默认最多评估 64 条，精细最多 120 条，额外单独评估最短参考。

## 边界

这是候选搜索加离散覆盖估算，不是全局最优求解器。二维建筑模型没有建筑高度、地形、树木、临时围挡、建筑立面奖励或实时通行信息；OSM 道路和建筑完整度也会影响结果。建筑内部不是可见地面；大面积开阔空间会受到偏好。输入点吸附到最近的原始道路节点，偏移在界面中报告，连接虚线不计入路线或覆盖评分。模型不把机动车道路中心线等同于精确的人行道位置。

起终点和途经点的吸附节点都是路线必经节点。最短参考可能不满足更严格的回头/重复限制，此时会明确说明。视野优先路线的约束检查不放宽。数据边界附近的视域可能低估，界面会提示。

## 来源、许可与服务

OSM 数据及导出衍生数据：© OpenStreetMap contributors，ODbL 1.0。Leaflet 1.9.4 使用 BSD-2-Clause，许可随本地资源保留。本项目不调用 Nominatim，不提供公共地址检索服务。

- https://www.openstreetmap.org/copyright
- https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
- https://operations.osmfoundation.org/policies/tiles/
- https://leafletjs.com/download.html
- https://private.coffee/services.html
- https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances

只在使用者浏览地图时加载当前视窗所需底图，不预下载瓦片。自动化浏览测试拦截瓦片请求，不向公共瓦片服务发送测试流量。公共 Overpass 只在使用者计算快照外区域时调用，并限制区域与并发；上线大规模使用需要稳定数据后端。Overpass 主服务 overpass-api.de 的快部署 AI 应用限制使其不适合作为本原型的线上后端，因此运行时不调用它；快照属于一次性人工触发的数据提取。

## 第一版实测

默认东京三点：视野路线约 2.14 km，最短参考约 1.95 km；去重可见面积从约 21.94 ha 增加至 27.52 ha（+25.4%）。这组约束下没有重复物理路段，长度增加约 9.7%，未超出 25% 绕行预算。数据、选点、采样精度变化后结果可能改变。

源码界面和算法在 `public/`，同源地图代理在 `server/data-proxy.mjs`，托管路由在 `app/`。前端使用 Web Worker 计算，不把路线计算放到服务器。绿色覆盖为全程视域并集，橙色为当前观察点的建筑遮挡视域；滑动“沿路线观察”检查遮挡。

第一批十个城区均已用完整真实数据运行算法和浏览器流程，示例路线均在 25% 绕行预算内且不重复物理路段；导入数据、切换城区、全球坐标定位和 390 px 手机布局也已检查。新增区域仍依赖数据后端：此前 Private.coffee 查询暂报 HTTP 500、VK Maps 暂报 HTTP 504，因此不能保证任意城市、任意地点的即时加载。十个内置城区和范围内重设点位不依赖外部地图 API；公共底图失败时仍显示实际道路和建筑。此限制不能用虚构建筑或直线路径替代。
