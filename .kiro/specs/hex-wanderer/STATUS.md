# HexWanderer 项目状态

## 技术栈
- 纯 JS (ES6+)，无框架，PixiJS v7 + Tailwind CSS (CDN)
- 本地 HTTP 服务器开发，无构建工具
- 数据驱动：terrain.json, building.json, item.json, event.json, difficulty.json

## 核心文件结构
- `src/core/GameLoop.js` — 游戏主循环/状态机（最大最复杂的文件）
- `src/core/EventBus.js` — 事件总线
- `src/core/ConfigLoader.js` — JSON 配置加载（含 difficulty.json）
- `src/systems/` — MovementSystem, TurnSystem, EventSystem, FogSystem, ItemSystem, BuildingSystem, SaveSystem, PlayerState, PathfindingSystem
- `src/render/` — RenderEngine, HexRenderer, AssetLoader, LayerManager, Camera
- `src/ui/` — UIManager, HUD, DialogManager, InputHandler
- `src/map/` — HexGrid, MapGenerator, MapData
- `src/utils/` — SeededRandom, SimplexNoise, HexMath
- `tests/map-preview.html` — 独立地图预览页面（有自己的渲染逻辑，需要和主游戏同步）
- `config/difficulty.json` — 难度递增配置（伤害缩放 + 物价缩放，独立参数）

## 当前版本: v1.4

### 已完成功能
- 六边形地图生成（种子随机，3档尺寸25/50/75）
- 移动系统（AP消耗、海拔差、地形通行、摔伤）
- 回合系统（AP恢复、休息效果、过夜事件）
- 战争迷雾（三态、BFS视野、灯塔/瞭望塔永久揭雾、explored迷雾下建筑可见）
- 事件系统（188+事件、战斗/宝箱/选择、事件刷新、过夜事件正常显示结果）
- 建筑系统（26种建筑、传送阵1-5组变体素材、城堡训练+过夜）
- 道具系统（64种道具、10种合成、消耗品正确消耗、道具阻断、重复折算金币）
- 道具效果全部实现：npcFriendly, combatNoDamageOnWin(30%概率), combatSurrenderChance, ruinLootUpgrade, luckModifier, trapImmunity, bribe, scare(稻草人/气球), beast_flute, earphone hint
- 存档系统（localStorage自动存档、JSON导入导出、permanentlyRevealed/pathTarget持久化）
- 自动寻路（A*算法、路径高亮青色、自动移动300ms间隔、跨回合保留、事件后重算路径）
- 后期难度递增（伤害/物价从第30回合起每15回合+10%，伤害上限75HP，配置驱动）
- 加载页面（12地块进度动画、CDN异步加载、失败提示、favicon）
- HUD优化（增量更新不闪烁、素材图标替代emoji、debuff/金币/圣遗物图标）
- 素材图标系统（事件对话框道具图标、选项道具图标、地块信息建筑图标、toast支持HTML）
- 素材预加载（地形+建筑+道具64个+UI图标全部启动时预加载，手机不再闪烁）
- void虚空地形（不可通行、不渲染、永远黑色迷雾，地图编辑器预留）
- 地形描述适配（terrainDescriptions机制：水域宝箱显示"漂浮水面"而非"灌木丛中"）

### 素材状态: 113/113 全部完成
- 地形 11/11, 建筑 26/26（含传送阵5变体）, 道具 64/64, UI 12/12（含logo/debuff图标/金币/圣遗物）

### 道具改名记录
- 船只→船, 狼毒草→防狼喷雾, 车→越野车, 女巫扫帚→飞天扫帚
- 盗贼印记→盗贼工具, 巨型火把→篝火, 芭蕉扇→扇子

### 关键设计决策
- 坐标系：even-r offset (col, row)，存储为 {q: col, r: row}
- 渲染五层：terrain → decoration → building → entities → fog
- explored 迷雾下建筑可见（fog层上方重绘建筑图标，alpha 0.65）
- 过夜事件结果正常显示（不抑制），回合汇总对话框显示HP/AP总变化
- AP=0 不自动结束回合，需手动点击
- 消耗品道具在事件中通过 consume_item outcome 消耗（大蒜/防狼喷雾/烟雾弹/气球等）
- 道具效果通过 EventSystem.triggerEvent 动态注入选项（唤兽笛、气球、稻草人、法老法典劝降、贿赂等）
- 道具已拥有或被合成阻断时折算金币（50%品质价格）
- void 地形：不可通行、不渲染、永远黑色迷雾（地图编辑器预留）
- 篝火晚会需要手风琴+篝火(mega_torch)且在草地/荒漠才能触发
- 难度递增：damageScaling 和 priceScaling 独立配置，公式 1 + floor((turn - startTurn) / interval + 1) * increment
- 法老法典没有 lethal_save 效果（之前误加已移除）
- 沙漏道具已移除（太复杂）、干果道具已移除
- toast 使用 innerHTML 渲染（支持图标HTML）
- HUD 按钮使用 innerHTML 渲染（支持图标HTML）
- 地形通行检查同时支持 requiredItem 和 terrain_pass 效果（合成品继承通行能力：黑珍珠号→水域，熔岩核心→熔岩）
- 大师之剑 combatNoDamageOnWin 仅在战斗事件中触发（30%概率），非战斗事件（祭坛等）不触发
- 非 repeatable 建筑事件触发后标记 _buildingEventConsumed，不再重复触发（训练场、城市集市等）
- scare 选项（气球/稻草人）排除自然灾害事件（暴风雪）和怪物营地
- HP上限减少时自动钳制当前HP，满血回血不显示HP+0
- 圣物碎片集齐后再获得折算为50金币
- 旅行者交换(exchange_item)获得道具后触发自动合成检查
- 篝火 reset_combat_events 刷新概率30%，匹配地形 allowedTerrains
- 事件支持 terrainDescriptions 按地形切换描述文本
- RenderTexture 分辨率自动适配 GPU MAX_TEXTURE_SIZE（大地图手机兼容）

### 已知注意事项
- event.json 非常大（5300+行），修改时注意 JSON 格式
- map-preview.html 有独立的渲染逻辑，改了主游戏渲染后需要同步（传送阵变体、寻路等）
- 浏览器 ES module 缓存顽固，改了代码后需要无痕窗口或 Disable cache 测试
- HexGrid.distance 用的是 axial 距离公式但传入的是 offset 坐标，作为启发式可用但不精确
- index.html CDN 脚本异步加载，断网时会显示加载失败提示
- _handleTileEvent 有 try-catch 安全网，错误时自动恢复 PLAYING 状态防止卡死
- _onDeath 后检查 state !== PLAYING 而非直接 return，支持救命道具后继续游戏流程
- 75x75 地图 RenderTexture 在 resolution 2 下约 4800x4158 像素，超出部分手机 GPU 4096 限制，已自动降级
- PathfindingSystem 的 requiredItem 检查需与 MovementSystem 保持同步（两处都已改为支持 terrain_pass）

### 待完成/延期功能
- 地图编辑器（延期到下个版本）

### Hooks
- `read-project-status` — userTriggered 手动触发，读取 STATUS.md 了解项目状态
- `update-project-status` — userTriggered 手动触发，更新 STATUS.md（已从 agentStop 改为手动）
