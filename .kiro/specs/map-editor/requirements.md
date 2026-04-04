# 需求文档：地图编辑器

## 简介

为 HexWanderer 六角格探索冒险游戏添加一个可视化地图编辑器功能。编辑器允许用户在浏览器中创建、编辑和导出自定义六角格地图，支持地形绘制、海拔调整、建筑放置、事件配置等操作。编辑器复用现有的 HexGrid、MapData、RenderEngine 和 Camera 系统，以独立页面（`editor.html`）的形式提供。编辑器还包含地图存储管理系统，支持自定义地图的保存、加载和在游戏中使用。

## 术语表

- **Editor**: 地图编辑器应用，运行在独立的 `editor.html` 页面中
- **Canvas**: PixiJS 渲染画布，用于显示和交互六角格地图
- **ToolPanel**: 编辑器左侧的工具面板，分为地块/建筑/事件三个 Tab 页
- **Toolbar**: 编辑器顶部的工具栏，包含文件操作和全局设置
- **MapData**: 地图数据结构，以 `"q,r"` 为 key 的 Map 存储地块数据
- **Tile**: 单个六角格地块，包含 terrain、elevation、building、event 属性
- **Terrain**: 地形类型（grass、desert、water、forest、swamp、lava、ice、void 等）
- **Elevation**: 海拔值，整数范围 0-10
- **Building**: 建筑类型（camp、city、portal、teleporter 等），来自 `config/building.json`
- **Event**: 事件标识符，来自 `config/event.json`
- **BrushSize**: 笔刷大小，以六角格半径为单位（1 = 单格，2 = 7格，3 = 19格）
- **EditorState**: 编辑器当前状态，包含当前工具、笔刷大小、选中的地形/建筑/事件、事件配置、起始位置等
- **CustomMap**: 自定义地图数据包，包含 MapData、元信息、事件配置和起始位置
- **MapLibrary**: 地图库，存储在 localStorage 中的自定义地图集合
- **MapFile**: 导出的地图文件，JSON 格式，扩展名 `.hexmap.json`
- **EventConfig**: 事件生成配置，控制游戏加载时自动生成大世界事件的密度

## 需求

### 需求 1：编辑器入口与初始化

**用户故事：** 作为地图设计者，我希望通过独立页面打开地图编辑器，以便在不影响游戏的情况下创建和编辑地图。

#### 验收标准

1. WHEN 用户在浏览器中打开 `editor.html`, THE Editor SHALL 加载 PixiJS 和所有配置文件（terrain.json、building.json、event.json、item.json），并完成初始化
2. WHEN Editor 初始化完成, THE Editor SHALL 显示一个空白的六角格地图画布，默认地图尺寸为 25×25（small），所有地块初始化为 grass 地形、海拔 5
3. THE Toolbar SHALL 提供"新建地图"按钮，允许用户选择地图尺寸（small: 25×25, medium: 50×50, large: 75×75）
4. THE Editor SHALL 复用现有的 RenderEngine、Camera、HexRenderer 进行地图渲染和视口控制
5. THE Editor SHALL 使用纯 CSS 样式（深色主题），与游戏视觉风格保持一致

### 需求 2：地形绘制工具

**用户故事：** 作为地图设计者，我希望用笔刷在地图上绘制不同地形，以便快速构建地图的基本地貌。

#### 验收标准

1. THE ToolPanel 地块 Tab SHALL 显示所有可用地形类型（grass、desert、water、forest、swamp、lava、ice、void），每种地形以对应的颜色标识
2. WHEN 用户选中一种地形并在 Canvas 上点击某个 Tile, THE Editor SHALL 将该 Tile 的 terrain 属性设置为选中的地形类型
3. WHEN 用户选中一种地形并在 Canvas 上拖拽, THE Editor SHALL 将拖拽路径上所有 Tile 的 terrain 属性设置为选中的地形类型
4. THE ToolPanel SHALL 提供 BrushSize 选择器（1、2、3），默认值为 1
5. WHEN BrushSize 大于 1, THE Editor SHALL 以点击位置为中心，将半径范围内的所有 Tile 设置为选中的地形类型
6. WHEN 地形被修改, THE Editor SHALL 立即重新渲染受影响的区域

### 需求 3：海拔编辑工具

**用户故事：** 作为地图设计者，我希望调整每个地块的海拔值，以便创建山脉、谷地等地形起伏效果。

#### 验收标准

1. THE ToolPanel 地块 Tab SHALL 提供三个互斥的海拔编辑按钮：「升高 +1」「降低 -1」「设置为 ▼（0-10）」
2. WHEN 用户选中"升高 +1"并点击一个 Tile, THE Editor SHALL 将该 Tile 的 elevation 值增加 1，上限为 10
3. WHEN 用户选中"降低 -1"并点击一个 Tile, THE Editor SHALL 将该 Tile 的 elevation 值减少 1，下限为 0
4. WHEN 用户选中"设置为"并选择一个值（0-10），点击 Tile 时 THE Editor SHALL 将 elevation 设置为该值
5. WHEN 用户选中海拔工具并在 Canvas 上拖拽, THE Editor SHALL 对拖拽路径上所有 Tile 执行对应操作
6. WHEN 海拔被修改, THE Editor SHALL 立即更新渲染，包括海拔阴影和 2.5D 偏移效果
7. THE Editor SHALL 支持 BrushSize 对海拔编辑的影响，与地形绘制工具行为一致

### 需求 4：建筑放置工具

**用户故事：** 作为地图设计者，我希望在地图上放置各种建筑，以便设计游戏中的关键地点和交互点。

#### 验收标准

1. THE ToolPanel 建筑 Tab SHALL 显示所有可用建筑类型（来自 building.json），每种建筑以对应的素材图片和名称标识
2. WHEN 用户选中一种建筑并点击一个 Tile, THE Editor SHALL 将该 Tile 的 building 属性设置为选中的建筑类型
3. WHEN 用户在已有建筑的 Tile 上放置新建筑, THE Editor SHALL 替换原有建筑为新建筑
4. THE ToolPanel SHALL 提供"橡皮擦"模式，用于清除 Tile 上的建筑或事件
5. WHEN 用户放置 portal 类型建筑, THE Editor SHALL 更新 MapData 的 portalPosition 属性
6. WHEN 用户放置 teleporter 类型建筑, THE Editor SHALL 自动分配 teleporterPairIndex 并管理 teleportPairs 配对关系
7. IF 用户尝试在不兼容的地形上放置建筑（违反 allowedTerrains 约束）, THEN THE Editor SHALL 显示警告提示并阻止放置

### 需求 5：事件配置工具

**用户故事：** 作为地图设计者，我希望在地图上配置事件触发点，以便设计游戏中的剧情和战斗遭遇。

#### 验收标准

1. THE ToolPanel 事件 Tab SHALL 显示可用事件类型（来自 event.json），按类型分组（combat、treasure、choice），过滤掉过夜事件和建筑触发事件
2. WHEN 用户选中一种事件并点击一个 Tile, THE Editor SHALL 将该 Tile 的 event 属性设置为选中的事件标识符
3. THE ToolPanel SHALL 提供"橡皮擦"模式，用于清除 Tile 上的事件

### 需求 6：圣物事件配置

**用户故事：** 作为地图设计者，我希望在地图上放置圣物事件，以便设计游戏的胜利条件。

#### 验收标准

1. THE ToolPanel 事件 Tab SHALL 提供三个圣物事件按钮：圣物守护者（relic_guardian）、圣物祭坛（relic_shrine）、圣物试炼（relic_trial）
2. WHEN 用户选中一个圣物事件并点击 Tile, THE Editor SHALL 将该 Tile 的 event 属性设置为对应的圣物事件 ID
3. THE Editor SHALL 在画布上用圣物图标（relic.png）标记所有包含 relic_ 前缀事件的 Tile
4. THE InfoPanel SHALL 显示已放置的圣物事件数量和通关所需数量（relicsNeeded）
5. THE InfoPanel SHALL 提供 relicsNeeded 数值输入框，允许用户设置通关所需的圣物碎片数量，默认值为 3

### 需求 7：事件生成配置

**用户故事：** 作为地图设计者，我希望配置大世界事件的自动生成参数，以便在游戏加载时按比例自动填充事件。

#### 验收标准

1. THE ToolPanel 事件 Tab SHALL 提供事件配置面板，包含：启用/禁用开关、宝箱比例滑块（0-100%）、事件比例滑块（0-100%）
2. WHEN 事件配置启用, THE Game SHALL 在加载自定义地图时按配置的密度自动生成大世界事件
3. THE EventConfig SHALL 随地图一起保存到地图库和导出文件中

### 需求 8：地图信息面板与选择工具

**用户故事：** 作为地图设计者，我希望查看当前选中地块的详细信息，以便精确调整地块属性。

#### 验收标准

1. THE ToolPanel SHALL 提供"选择"工具，点击地块时在信息面板中显示该 Tile 的详细信息
2. WHEN 用户将鼠标悬停在一个 Tile 上, THE Editor SHALL 在信息面板中显示该 Tile 的坐标（q, r）、地形类型、海拔值、建筑类型和事件标识符
3. THE Editor SHALL 在信息面板中显示地图统计信息，包括地图尺寸、各地形类型的数量占比、建筑总数和事件总数

### 需求 9：玩家起始位置设置

**用户故事：** 作为地图设计者，我希望设置玩家的起始位置，以便控制游戏开始时玩家出现的地点。

#### 验收标准

1. THE ToolPanel SHALL 提供"起始位置"工具，点击地块时设置玩家出生点
2. THE Editor SHALL 在画布上用玩家图标（player.png）标记起始位置
3. WHEN 未设置起始位置时, THE Game SHALL 默认使用地图中心作为起始位置
4. THE spawnPosition SHALL 随地图一起保存到地图库和导出文件中

### 需求 10：撤销与重做

**用户故事：** 作为地图设计者，我希望能够撤销和重做编辑操作，以便在犯错时快速恢复。

#### 验收标准

1. THE Editor SHALL 维护一个操作历史栈，记录每次编辑操作的前后状态
2. WHEN 用户按下 Ctrl+Z（或点击撤销按钮）, THE Editor SHALL 撤销最近一次编辑操作并恢复地图到操作前的状态
3. WHEN 用户按下 Ctrl+Shift+Z（或点击重做按钮）, THE Editor SHALL 重做最近一次被撤销的操作
4. THE Editor SHALL 支持至少 50 步撤销历史
5. WHEN 用户在撤销后执行新的编辑操作, THE Editor SHALL 清除重做栈

### 需求 11：地图文件导出与导入

**用户故事：** 作为地图设计者，我希望将编辑好的地图导出为文件，并能够重新导入编辑，以便保存和分享自定义地图。

#### 验收标准

1. WHEN 用户点击"导出文件"按钮, THE Editor SHALL 将当前地图数据序列化为 JSON 格式并下载为 `.hexmap.json` 文件
2. THE Editor SHALL 导出以下数据结构：`{ version, meta, mapData, eventConfig, spawnPosition }`
3. WHEN 用户点击"导入文件"按钮并选择一个 `.hexmap.json` 文件, THE Editor SHALL 反序列化并加载地图数据到编辑器中
4. IF 导入的文件格式无效或数据不完整, THEN THE Editor SHALL 显示错误提示并保留当前地图不变

### 需求 12：地图库管理（本地存储）

**用户故事：** 作为地图设计者，我希望在浏览器中保存多张自定义地图，以便随时切换编辑不同的地图。

#### 验收标准

1. THE Editor SHALL 使用 localStorage 维护一个 MapLibrary，存储用户保存的所有自定义地图
2. WHEN 用户点击"保存到地图库"按钮, THE Editor SHALL 弹出对话框让用户输入地图名称和描述，然后将当前地图保存到 MapLibrary
3. WHEN 用户点击"地图库"按钮, THE Editor SHALL 显示所有已保存地图的列表，包含名称、尺寸、创建时间
4. WHEN 用户从地图库中选择一张地图, THE Editor SHALL 加载该地图到编辑器中进行编辑
5. THE MapLibrary SHALL 支持删除已保存的地图

### 需求 13：游戏加载自定义地图

**用户故事：** 作为玩家，我希望在游戏中选择使用自定义地图进行游戏，以便体验地图设计者创建的关卡。

#### 验收标准

1. THE Game SHALL 在新游戏界面始终提供"导入地图文件"选项
2. WHEN 地图库中存在自定义地图, THE Game SHALL 在新游戏界面提供"从地图库选择"选项
3. WHEN 用户选择自定义地图, THE Game SHALL 使用 MapData.fromJSON() 加载地图数据，跳过 MapGenerator 的随机生成流程
4. WHEN eventConfig.enabled 为 true, THE Game SHALL 在加载时按配置密度自动生成大世界事件
5. THE Game SHALL 使用自定义地图的 spawnPosition 作为玩家起始位置（未设置时使用地图中心）
6. THE Game SHALL 在自定义地图上正常运行所有游戏系统（移动、事件、战斗、迷雾等）
7. WHEN 自定义地图缺少必要数据（如 portalPosition 为 null）, THE Game SHALL 自动检测或回退到随机生成模式

### 需求 14：随机生成辅助

**用户故事：** 作为地图设计者，我希望能够基于种子随机生成一张基础地图，然后在此基础上手动微调，以便加速地图创建流程。

#### 验收标准

1. THE Toolbar SHALL 提供"随机生成"按钮
2. WHEN 用户点击"随机生成"按钮, THE Editor SHALL 弹出对话框让用户输入种子值（seed）和地图尺寸
3. WHEN 用户确认生成参数, THE Editor SHALL 调用现有的 MapGenerator 生成完整地图，并加载到编辑器中
4. WHEN 随机生成完成, THE Editor SHALL 允许用户在生成的地图基础上继续手动编辑

### 需求 15：地图验证

**用户故事：** 作为地图设计者，我希望编辑器能够检查地图的合法性，以便确保地图在游戏中可以正常运行。

#### 验收标准

1. THE Toolbar SHALL 提供"验证地图"按钮
2. WHEN 用户点击"验证地图"按钮, THE Editor SHALL 执行以下检查并显示结果：
   - 地图中是否存在至少一个 portal 建筑
   - 圣物事件数量是否大于等于 relicsNeeded
   - 从地图中心出发，所有非 void 地块是否可达
   - 建筑放置是否符合 allowedTerrains 约束
   - teleporter 是否成对存在
3. IF 验证发现问题, THEN THE Editor SHALL 以列表形式显示所有问题，并在地图上高亮标记有问题的 Tile
4. IF 验证通过, THEN THE Editor SHALL 显示"地图验证通过"的成功提示

### 需求 16：视口控制与网格显示

**用户故事：** 作为地图设计者，我希望能够自由平移和缩放地图视图，并切换网格线显示。

#### 验收标准

1. THE Editor SHALL 复用现有的 Camera 系统，支持鼠标拖拽平移、滚轮缩放和触屏捏合缩放
2. THE Toolbar SHALL 提供"适应窗口"按钮，点击后将缩放级别调整为使整个地图可见
3. THE Toolbar SHALL 提供"显示网格"切换按钮，默认为开启状态
4. WHEN 网格显示开启, THE Editor SHALL 在每个六角格边缘绘制半透明的网格线

### 需求 17：工具面板 Tab 布局

**用户故事：** 作为地图设计者，我希望工具面板按功能分类，以便快速找到需要的工具。

#### 验收标准

1. THE ToolPanel SHALL 分为三个 Tab 页：地块（🗺️）、建筑（🏠）、事件（📋）
2. 同一时间只显示一个 Tab 的内容，通过点击 Tab 按钮切换
3. 地块 Tab 包含：地形选择器、笔刷大小、海拔控制、特殊工具（选择/橡皮擦/起始位置）
4. 建筑 Tab 包含：建筑选择器列表（显示素材图片）
5. 事件 Tab 包含：事件配置面板、事件选择器、圣物事件选择器

### 需求 18：地图预览与试玩（后续迭代）

**用户故事：** 作为地图设计者，我希望能够在编辑器中快速预览地图效果。

#### 验收标准

（延后至后续迭代实现）
