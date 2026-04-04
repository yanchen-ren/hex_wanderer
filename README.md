# HexWanderer 六边形浪游者

轻量级 H5 六边形地块探索 Roguelike 游戏。在迷雾笼罩的随机地图中探索，收集三件圣物碎片，抵达传送门通关。

## 在线试玩

👉 [https://yanchen-ren.github.io/hex_wanderer/](https://yanchen-ren.github.io/hex_wanderer/)

## 本地运行

```bash
# 需要任意 HTTP 服务器（ES Module 不支持 file:// 协议）
python3 -m http.server 8080

# 浏览器打开游戏
open http://localhost:8080

# 打开地图编辑器
open http://localhost:8080/editor.html
```

## 技术栈

- PixiJS v7+（渲染引擎，CDN 引入）
- 纯 JavaScript ES6+，无框架依赖
- Tailwind CSS（CDN）
- JSON 数据驱动（地形/建筑/道具/事件）

## 项目结构

```
├── index.html          # 游戏入口
├── editor.html         # 地图编辑器入口
├── config/             # JSON 数据配置
│   ├── terrain.json    # 地形类型
│   ├── building.json   # 建筑类型
│   ├── item.json       # 道具类型
│   └── event.json      # 事件配置
├── src/                # 源代码
│   ├── core/           # 核心引擎（EventBus, GameLoop, ConfigLoader）
│   ├── map/            # 地图（HexGrid, MapGenerator, MapData）
│   ├── systems/        # 游戏系统（移动/回合/事件/迷雾/道具/建筑/存档）
│   ├── render/         # 渲染层（RenderEngine, Camera, HexRenderer）
│   ├── ui/             # UI（HUD, DialogManager, UIManager）
│   ├── editor/         # 地图编辑器（EditorMain, EditorState, EditorTools, EditorUI 等）
│   └── utils/          # 工具（SeededRandom, SimplexNoise, HexMath）
├── assets/             # 素材资源
│   ├── terrain/        # 地形素材
│   ├── building/       # 建筑素材
│   ├── item/           # 道具素材
│   └── ui/             # UI 素材
├── tests/              # 测试
│   ├── index.html      # 浏览器端测试运行器
│   ├── unit/           # 单元测试
│   ├── property/       # 属性测试（fast-check）
│   ├── map-preview.html # 地图预览工具
│   └── asset-preview.html # 素材预览工具
└── .kiro/specs/        # 需求/设计/任务文档
```

## 游戏玩法

- 点击相邻地块移动，消耗行动力（AP）
- 不同地形有不同 AP 消耗和效果
- 海拔差影响移动风险（下坡可能摔伤）
- 收集道具克服地形障碍（钩爪、降落伞、船只等）
- 探索事件获取奖励或面对挑战
- 收集 3 块圣物碎片后到达传送门通关

## 开发工具

- `tests/index.html` — 单元测试 + 属性测试运行器
- `tests/map-preview.html` — 地图生成预览（可交互）
- `tests/asset-preview.html` — 素材预览

## 地图编辑器

打开 `editor.html` 进入可视化地图编辑器，支持：

- 地形绘制（8 种地形 + 笔刷大小 1/2/3）
- 海拔调整（升高/降低/直接设置 0-10）
- 建筑放置（自动校验地形约束、portal/teleporter 特殊逻辑）
- 事件配置（手动放置 + 运行时自动生成密度配置）
- 圣物事件放置（守护者/祭坛/试炼）
- 玩家起始位置设置
- 撤销/重做（Ctrl+Z / Ctrl+Shift+Z，最多 50 步）
- 地图验证（portal、圣物、可达性、建筑约束、teleporter 配对）
- 地图库管理（localStorage 保存/加载/删除）
- 文件导入导出（.hexmap.json 格式）
- 随机生成辅助（基于种子生成后手动微调）
- 响应式布局（桌面端 + 移动端适配）

编辑好的地图可以在游戏新游戏界面通过「从地图库选择」或「导入地图文件」加载使用。
