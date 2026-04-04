# 任务列表：地图编辑器 (Map Editor)

## 1. 项目基础设施
- [x] 1.1 创建 `editor.html` 入口页面，包含纯 CSS 样式（深色主题）、PixiJS CDN 加载、响应式 viewport meta 标签和基础 HTML 结构（editor-layout、tool-panel、canvas-area、info-panel）
- [x] 1.2 创建 `src/editor/EditorMain.js`，实现编辑器初始化流程：加载 PixiJS、ConfigLoader.loadAll()、创建 PixiJS Application（resizeTo 画布容器）、初始化 RenderEngine（fogEnabled=false）、创建 EventBus，渲染默认 25×25 grass 地图
- [x] 1.3 创建 `src/editor/EditorState.js`，实现编辑器状态管理：currentTool、brushSize、selectedTerrain/Building/Event、elevationValue、gridVisible、mapMeta，所有 setter 通过 EventBus 发布变更事件

## 2. 命令历史系统
- [x] 2.1 创建 `src/editor/CommandHistory.js`，实现撤销/重做栈：execute(command)、undo()、redo()、canUndo()、canRedo()、clear()，最大 50 步历史，新编辑清除重做栈
- [x] 2.2 实现 TileEditCommand 类：构造函数接收 mapData 和 changes 数组（{q, r, before, after}），execute() 应用 after 状态，undo() 恢复 before 状态

## 3. 编辑工具核心逻辑
- [x] 3.1 创建 `src/editor/EditorTools.js`，实现 getBrushTiles(q, r, brushSize) 方法，使用 HexGrid.hexesInRange 获取笔刷范围内的 tile 坐标，过滤越界坐标
- [x] 3.2 实现地形绘制工具：paintTerrain(q, r) 方法，根据当前 brushSize 获取影响范围，生成 changes 数组并返回
- [x] 3.3 实现海拔编辑工具：adjustElevation(q, r, delta) 和 setElevation(q, r, value) 方法，海拔值钳制到 [0, 10] 范围，支持 brushSize
- [x] 3.4 实现建筑放置工具：placeBuilding(q, r, buildingId) 方法，校验 allowedTerrains 约束，返回 changes 和 warnings；实现 eraseBuilding(q, r)
- [x] 3.5 实现建筑放置的特殊逻辑：portal 放置时更新 mapData.portalPosition；teleporter 放置时自动分配 pairIndex 并管理 teleportPairs 配对
- [x] 3.6 实现事件放置工具：placeEvent(q, r, eventId) 和 eraseEvent(q, r) 方法
- [x] 3.7 实现圣物碎片切换工具：toggleRelic(q, r) 方法，切换 relicPositions 数组中的位置（添加/移除）
- [x] 3.8 实现洪水填充工具：floodFill(q, r, newTerrain) 方法，使用 BFS 洪水填充算法替换相连同地形 tile；实现 fillAll(newTerrain) 全部填充

## 4. 地图验证
- [x] 4.1 创建 `src/editor/MapValidator.js`，实现 validate(mapData) 方法，返回 { valid, issues[] }
- [x] 4.2 实现验证检查项：_checkPortalExists、_checkRelicCount、_checkReachability（BFS 从中心出发）、_checkBuildingTerrainConstraints、_checkTeleporterPairs，每项返回 ValidationIssue（含 type、severity、message、tiles）

## 5. 地图库管理
- [x] 5.1 创建 `src/editor/MapLibrary.js`，实现 localStorage 地图库：save(id, customMap)、load(id)、delete(id)、list()、generateId()，CustomMap 结构包含 id、meta、mapJSON

## 6. 编辑器 UI（纯 CSS + 响应式）
- [x] 6.1 创建 `src/editor/EditorUI.js`，实现 UI 框架：init() 创建工具面板、工具栏、信息面板的 DOM 结构，使用纯 CSS class 样式
- [x] 6.2 实现工具面板（ToolPanel）：地形选择器（8 种地形缩略图/色块）、笔刷大小选择器（1/2/3）、建筑选择器（从 building.json 动态生成）、事件选择器（从 event.json 按类型分组）、海拔滑块（0-10）、圣物碎片工具按钮、橡皮擦按钮、填充工具按钮
- [x] 6.3 实现顶部工具栏（Toolbar）：新建地图（含尺寸选择对话框）、随机生成（含种子/尺寸对话框）、保存到地图库、地图库浏览、导出文件、导入文件、验证地图、撤销/重做按钮、网格显示切换、适应窗口按钮
- [x] 6.4 实现信息面板（InfoPanel）：悬停 tile 信息显示（坐标、地形、海拔、建筑、事件）、地图统计信息（尺寸、地形占比、建筑/事件总数）、验证结果显示、圣物碎片计数与 relicsNeeded 输入
- [x] 6.5 实现响应式布局：桌面端三栏布局（左侧工具面板 220px + 中间画布 + 信息面板）；移动端工具面板折叠为底部抽屉（可展开/收起）、工具栏图标模式、信息面板浮动卡片；CSS 媒体查询断点 768px
- [x] 6.6 实现对话框组件：地图库列表对话框、新建地图对话框、随机生成对话框、确认对话框（覆盖当前编辑警告），使用纯 CSS 样式与游戏深色主题一致
- [x] 6.7 实现 toast 通知组件：显示操作反馈（建筑约束警告、保存成功、导入错误等），自动消失

## 7. 编辑器输入处理与画布交互
- [x] 7.1 在 EditorMain 中实现画布输入处理：pointerdown/pointermove/pointerup 事件监听，区分点击和拖拽绘制，将屏幕坐标转换为 tile 坐标（通过 RenderEngine.screenToTile）
- [x] 7.2 实现拖拽绘制合并：拖拽过程中收集所有 tile 变更，pointerup 时合并为单个 TileEditCommand 提交到 CommandHistory
- [x] 7.3 实现键盘快捷键：Ctrl+Z 撤销、Ctrl+Shift+Z 重做
- [x] 7.4 实现鼠标悬停信息更新：pointermove 时更新 InfoPanel 显示当前 tile 信息
- [x] 7.5 实现触屏交互适配：单指操作为绘制（当选中绘制工具时）、双指操作始终为平移/缩放，工具面板按钮最小触摸目标 44×44px

## 8. RenderEngine 编辑器适配
- [x] 8.1 实现网格线渲染：在 decoration 层绘制半透明六角格边框，通过 EditorState.gridVisible 控制显示/隐藏
- [x] 8.2 实现编辑器高亮渲染：悬停 tile 高亮（半透明蓝色）、验证问题 tile 红色标记、圣物碎片位置特殊标记（使用 relic.png 图标）
- [x] 8.3 实现适应窗口功能：计算地图像素范围，调整 Camera 的 scale 和 position 使整个地图可见

## 9. 文件导入导出
- [x] 9.1 实现地图导出：将 MapData.toJSON() + meta 信息序列化为 MapFile JSON，触发浏览器下载 `.hexmap.json` 文件
- [x] 9.2 实现地图导入：读取 `.hexmap.json` 文件，校验 JSON 格式和必要字段（width、height、tiles），使用 MapData.fromJSON() 加载，失败时显示错误 toast 并保留当前地图

## 10. 随机生成辅助
- [x] 10.1 实现随机生成功能：弹出对话框输入 seed 和地图尺寸，调用 MapGenerator 生成完整地图（地形、建筑、事件、圣物碎片），加载到编辑器中，生成前提示未保存内容将被覆盖

## 11. 游戏加载自定义地图
- [x] 11.1 在 `src/main.js` 中集成 MapLibrary：游戏启动时检查地图库，存在自定义地图时在开始界面添加"使用自定义地图"选项
- [x] 11.2 实现自定义地图加载流程：选择地图后用 MapData.fromJSON() 加载，跳过 MapGenerator，验证 portalPosition 等必要数据，缺失时警告并回退到随机生成

## 12. 单元测试
- [x] 12.1 编写 EditorState 单元测试：工具切换、状态管理、事件发布
- [x] 12.2 编写 CommandHistory 单元测试：空栈撤销/重做、超过 50 步限制、新编辑清除重做栈
- [x] 12.3 编写 EditorTools 单元测试：地图边缘操作、void 地形处理、建筑 allowedTerrains 校验（具体建筑+地形组合）
- [x] 12.4 编写 MapValidator 单元测试：各种验证场景的具体示例（无 portal、圣物不足、不可达 tile、建筑地形违规、teleporter 未配对）
- [x] 12.5 编写 MapLibrary 单元测试：CRUD 操作、localStorage 异常处理
- [x] 12.6 编写导入导出单元测试：无效 JSON 导入、缺少字段导入、正常导入导出

## 13. 属性测试
- [x] 13.1 创建 `tests/property/editor-tools.property.js`，实现 Property 1-8 的属性测试：默认地图初始化、地形笔刷绘制、海拔调整钳制、建筑放置替换、Portal 位置不变量、Teleporter 配对不变量、建筑地形约束、事件放置
- [x] 13.2 创建 `tests/property/relic-toggle.property.js`，实现 Property 9：圣物碎片切换往返
- [x] 13.3 创建 `tests/property/command-history.property.js`，实现 Property 10-11：撤销/重做往返、新编辑清除重做栈
- [x] 13.4 创建 `tests/property/serialization.property.js`，实现 Property 12-13：MapData 序列化往返、无效导入拒绝
- [x] 13.5 创建 `tests/property/map-library.property.js`，实现 Property 14：地图库存取往返
- [x] 13.6 创建 `tests/property/map-validator.property.js`，实现 Property 15：地图验证正确性
- [x] 13.7 创建 `tests/property/flood-fill.property.js`，实现 Property 16-17：洪水填充正确性、全部填充正确性
