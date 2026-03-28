# v1.3 Tasks — 自动寻路系统

## Phase 1: PathfindingSystem 核心算法

- [x] 1. 创建 `src/systems/PathfindingSystem.js`
  - [x] 1.1 实现 A* 寻路算法 `findPath(start, goal)`
  - [x] 1.2 实现通行检查 `isPassable(fromTile, toTile)`
  - [x] 1.3 实现 AP 消耗计算 `getStepCost(fromTile, toTile)`
  - [x] 1.4 实现 `getReachableIndex(stepCosts, currentAP)`

## Phase 2: 路径渲染

- [x] 2. 路径高亮渲染
  - [x] 2.1 RenderEngine.renderPath() — 青色高亮，可达/不可达区分
  - [x] 2.2 RenderEngine.clearPath()
  - [x] 2.3 路径信息 toast

## Phase 3: GameLoop 集成 — 路径计算与显示

- [x] 3. 点击远端地块触发寻路
  - [x] 3.1 _onHexClick 集成：第一次点击显示路径，第二次点击出发
  - [x] 3.2 点击新远端地块替换旧路径
  - [x] 3.3 ESC 键 / 点击自身清除路径

## Phase 4: GameLoop 集成 — 自动移动执行

- [x] 4. 自动移动状态机
  - [x] 4.1 新增 STATES.AUTO_MOVING
  - [x] 4.2 UI 按钮：出发/继续 + 取消寻路
  - [x] 4.3 _autoMoveLoop 逐步移动（~300ms 延迟）
  - [x] 4.4 事件暂停后重新计算路径再继续
  - [x] 4.5 终止条件：AP 耗尽/传送/取消/死亡/路径失效

## Phase 5: 路径跨回合保留

- [x] 5. 跨回合路径保留
  - [x] 5.1 AP 耗尽保存 _pathTarget
  - [x] 5.2 新回合后重新计算路径
  - [x] 5.3 手动移动清除路径
  - [x] 5.4 存档保存/恢复 pathTarget

## Phase 6: 同步 preview

- [ ] 6. 更新 map-preview.html
  - [ ] 6.1 preview 简化版寻路（可选，低优先级）
