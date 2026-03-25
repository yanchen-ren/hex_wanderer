# 需求文档

## 简介

HexWanderer（六边形浪游者）是一款轻量级、基于 H5 的六边形地块探索 Roguelike 游戏。玩家在迷雾笼罩的随机生成地图中，通过消耗行动力（AP）在六边形地块间移动，经历随机事件，收集三件圣物碎片并抵达传送门以完成通关。游戏使用 PixiJS 引擎渲染，纯 JavaScript (ES6+) 实现，支持存档导入导出。

## 术语表

- **Game_System**: HexWanderer 游戏系统的总称
- **Map_Generator**: 负责随机生成六边形地图的模块
- **Movement_System**: 处理玩家在六边形地块间移动及 AP 消耗的模块
- **Event_System**: 管理地块事件触发与动态刷新的模块
- **Render_Engine**: 基于 PixiJS 的游戏渲染引擎
- **Save_System**: 负责游戏状态导出、导入与自动存档的模块
- **Turn_System**: 管理回合流转、AP 回复与休息效果的模块
- **Fog_System**: 管理战争迷雾显示与视野计算的模块
- **AP（行动力）**: Action Points，玩家每回合可用于移动的资源，初始上限为 5
- **HP（生命值）**: Health Points，玩家的生命值，初始为 100
- **海拔差（Δe）**: 两个相邻地块之间的海拔高度差值
- **Axial_Coordinates**: 六边形网格的轴坐标系，使用 (q, r) 表示
- **圣物碎片**: 分布在地图极值坐标处的收集物品，共 3 个
- **传送门**: 收集齐全部圣物碎片后生成的通关出口
- **GameState**: 包含完整游戏状态的 JSON 数据对象
- **Terrain_Config**: 地形类型配置文件，定义每种地形的移动消耗、通行条件、休息效果、事件概率、视野修正等属性，支持 JSON 数据驱动扩展
- **Building_Config**: 建筑/设施配置文件，定义每种建筑的效果、影响范围和触发条件，独立于地形叠加在地块上，支持 JSON 数据驱动扩展

## 需求

### 需求 1：六边形地图生成

**用户故事：** 作为玩家，我希望每局游戏都能生成一张自然且可探索的六边形地图，以获得不同的探索体验。

#### 验收标准

1. WHEN 玩家开始新游戏时，THE Map_Generator SHALL 支持两种地图来源：通过种子（seed）随机生成，或加载预设地图（JSON 数据驱动），地图使用 Axial_Coordinates (q, r) 坐标系
2. THE Map_Generator SHALL 为每个地块分配一个整数海拔值和一个地形类型，初始支持的地形类型包括：草地、荒漠、水域、森林、沼泽、熔岩、浮冰等，地形类型通过 JSON 配置文件定义，支持后续扩展新增地形
3. THE Map_Generator SHALL 提供三档地图尺寸供玩家选择：小(25×25)、中(50×50)、大(75×75)
4. THE Map_Generator SHALL 生成自然过渡的地形，避免纯随机分布，海拔和地形类型应呈现区域聚集的自然特征
5. THE Map_Generator SHALL 保证从玩家出生点出发，所有地块在无道具状态下可达，或在获得对应道具后可达（钩爪、降落伞、船只等）
6. THE Map_Generator SHALL 保证需要特定道具才能到达的区域，获取该道具的路径不依赖该道具（可达性闭环保证）
7. THE Map_Generator SHALL 将玩家初始位置设置在地图中心区域，且出生点周围必须为可直接通行的地块
8. WHEN 地图生成完成时，THE Map_Generator SHALL 在地图极值坐标处随机放置 3 个圣物碎片
9. WHEN 使用相同种子值和相同尺寸生成地图时，THE Map_Generator SHALL 产生完全相同的地图布局
10. THE Map_Generator SHALL 支持通过 JSON 文件导入预设地图，预设地图格式与随机生成的地图数据结构一致

### 需求 2：移动消耗与地形通行系统

**用户故事：** 作为玩家，我希望地形海拔差异和地形类型共同影响移动消耗和风险，以增加策略深度。

#### 验收标准

**AP 消耗计算（两个独立因素叠加）：**

1. THE Movement_System SHALL 按以下公式计算移动 AP 消耗：总消耗 = 目标地块地形基础消耗 + 海拔差修正
2. THE Movement_System SHALL 从地形配置（Terrain_Config）中读取每种地形类型的基础 AP 消耗值（如草地 1、沼泽 2、森林 1.5 等），支持数据驱动扩展
3. WHEN 海拔差 Δe = 0 时，THE Movement_System SHALL 不附加海拔修正，总消耗等于地形基础消耗
4. WHEN 海拔差 Δe 为 +1 至 +3（上坡）时，THE Movement_System SHALL 在地形基础消耗上额外加 Δe 点 AP
5. WHEN 海拔差 Δe 为 -1 或更低（下坡）时，THE Movement_System SHALL 将总消耗降低为 0.5 点 AP（固定值，不受地形基础消耗影响）

**海拔通行限制与风险：**

6. WHEN 海拔差 Δe 大于 +3 时，THE Movement_System SHALL 要求玩家持有钩爪道具方可通行，未持有时阻止移动
7. WHEN 海拔差 Δe 为 -1 至 -2 且玩家未持有降落伞时，THE Movement_System SHALL 以 10% 概率造成 10 点 HP 摔伤
8. WHEN 海拔差 Δe 为 -3 且玩家未持有降落伞时，THE Movement_System SHALL 以 40% 概率造成 30 点 HP 摔伤
9. WHEN 海拔差 Δe 小于等于 -4 且玩家未持有降落伞时，THE Movement_System SHALL 阻止该次移动并提示玩家需要降落伞
10. WHEN 玩家持有降落伞道具时，THE Movement_System SHALL 免疫所有下坡摔伤（Δe < 0 的摔伤概率归零），并允许通过悬崖（Δe ≤ -4）

**地形通行限制：**

11. WHEN 地形配置中定义某地形类型需要特定道具才能通行时（如水域需要船只、熔岩需要防火靴等），THE Movement_System SHALL 在玩家未持有该道具时阻止移动并提示所需道具
12. WHEN 玩家持有地形所需道具时，THE Movement_System SHALL 允许通行并按正常规则计算 AP 消耗

**水域特殊规则：**

13. THE Movement_System SHALL 限定进入水域的唯一道具为船只，不支持其他水上道具（游泳圈、木板等）
14. WHEN 玩家从陆地进入水域或从水域返回陆地时，THE Movement_System SHALL 要求出发地块与目标地块海拔相同，否则阻止移动
15. THE Movement_System SHALL 将同一连通水域区域内的所有地块视为同一海拔，但不同水域区域可以有不同海拔（如高山湖泊与低海拔大海）
16. WHEN 玩家进入或离开水域时，THE Movement_System SHALL 额外增加 AP 消耗（具体值由地形配置定义）

**通用规则：**

17. WHEN 玩家剩余 AP 不足以支付总移动消耗时，THE Movement_System SHALL 阻止该次移动
18. THE Movement_System SHALL 支持通过地形配置扩展新的地形×海拔组合效果

### 需求 3：回合与行动力机制

**用户故事：** 作为玩家，我希望通过回合制管理行动力，以进行有策略的探索。

#### 验收标准

**基础回合流程：**

1. THE Turn_System SHALL 在每个新回合开始时将玩家 AP 恢复至当前 AP 上限（初始上限为 5）
2. WHEN 玩家 AP 降至 0 时，THE Turn_System SHALL 自动结束当前回合
3. WHEN 玩家手动点击"结束回合"按钮时，THE Turn_System SHALL 结束当前回合并将回合数加 1
4. THE Game_System SHALL 在界面上持续显示当前回合数、玩家 AP（当前值/上限值）和 HP 数值

**AP 上限变动：**

5. THE Turn_System SHALL 支持通过道具（如不同品质的鞋子）或事件效果临时或永久提升玩家 AP 上限
6. THE Turn_System SHALL 支持负面效果（如中毒、诅咒等）临时降低玩家 AP 上限或导致每次移动额外消耗 AP
7. THE Turn_System SHALL 支持在特定地块或建筑处休息时临时增加下一回合的 AP（如在营地休息额外获得 AP），具体效果由地形配置或建筑配置定义

**剩余 AP 处理：**

8. WHEN 玩家手动结束回合且有剩余 AP 时，THE Turn_System SHALL 默认丢弃剩余 AP
9. WHEN 玩家持有特定道具时，THE Turn_System SHALL 支持将剩余 AP 转化为其他资源（如回复 HP），具体转化规则由道具配置定义
10. WHEN 玩家持有特定道具时，THE Turn_System SHALL 支持将剩余 AP 结转至下一回合，结转量不超过配置的结转上限

**AP 异常消耗：**

11. THE Turn_System SHALL 支持负面状态（遭遇战、中毒等）导致 AP 直接流失或移动时额外消耗 AP，具体效果由状态配置定义

### 需求 4：休息回复系统

**用户故事：** 作为玩家，我希望在不同地形上结束回合时获得不同的休息效果，以增加地形选择的策略性。

#### 验收标准

**基础休息效果：**

1. THE Turn_System SHALL 从地形配置中读取每种地形类型的休息效果，支持数据驱动扩展
2. WHEN 玩家在某地块上结束回合时，THE Turn_System SHALL 根据该地块的地形类型触发对应的休息效果（如草地回复 HP、高海拔地形增加视野等）
3. WHEN 玩家 HP 已达到上限时，THE Turn_System SHALL 不再额外增加 HP
4. THE Turn_System SHALL 支持地形配置中定义负面休息效果（如沼泽中毒、熔岩灼伤等）
5. WHEN 玩家在水域地块（持有船只）上结束回合时，THE Turn_System SHALL 允许休息并触发水域对应的休息效果

**道具对休息的影响：**

6. THE Turn_System SHALL 支持道具增强休息效果（如帐篷增加 HP 回复量等），具体增强规则由道具配置定义
7. THE Turn_System SHALL 支持道具抵消负面休息效果（如解毒药抵消沼泽中毒等），具体抵消规则由道具配置定义

**过夜事件：**

8. WHEN 玩家在地块上结束回合时，THE Event_System SHALL 根据该地块地形类型的过夜事件概率，以一定概率触发过夜事件（如怪物突袭等）
9. THE Event_System SHALL 从地形配置中读取每种地形类型的过夜事件概率和可触发的事件列表

### 需求 5：战争迷雾与视野系统

**用户故事：** 作为玩家，我希望地图被迷雾覆盖，通过探索逐步揭开，且视野受地形和装备影响，以增加探索的未知感和策略性。

#### 验收标准

**迷雾三态显示：**

1. THE Fog_System SHALL 将地块分为三种可见状态：未探索（纯黑色，完全不可见）、已探索但不在视野内（半透明，可见地形但不显示事件和怪物）、在视野内（完全可见，显示所有信息）
2. WHEN 新游戏开始时，THE Fog_System SHALL 将除玩家视野范围内的所有地块标记为未探索（纯黑色）
3. WHEN 玩家移动到新地块时，THE Fog_System SHALL 将视野范围内的地块标记为已探索并完全可见
4. WHEN 玩家离开某区域后，THE Fog_System SHALL 将不再处于视野范围内的已探索地块切换为半透明状态，隐藏其上的事件和怪物信息

**视野计算：**

5. THE Fog_System SHALL 将玩家基础视野设置为 2 格（视野点数 VP = 2）
6. THE Fog_System SHALL 使用 BFS 扩散计算视野范围：看到比当前格低的相邻地块消耗 0.5 VP，看到同海拔或更高的相邻地块消耗 1 VP
7. THE Fog_System SHALL 保证玩家直接相邻的地块（距离 1）始终可见，不受海拔差或地形阻挡影响
8. WHEN 视野扩展穿过海拔差 ≥ 3 的悬崖地块时，THE Fog_System SHALL 额外消耗等于海拔差的 VP（悬崖本身可见，但阻挡视野继续延伸）
9. WHEN 视野扩展穿过森林地块时，THE Fog_System SHALL 额外消耗 1 点 VP（森林本身可见，但阻挡视野继续延伸）
10. THE Fog_System SHALL 确保视野最小范围为玩家所在地块及其直接相邻地块

**视野增强：**

10. THE Fog_System SHALL 支持道具（如望远镜）临时或永久增加视野范围
11. THE Fog_System SHALL 支持事件效果永久增加视野范围
12. THE Fog_System SHALL 支持建筑效果（如灯塔）在玩家处于其影响范围内时增加视野

### 需求 6：动态事件与刷新系统

**用户故事：** 作为玩家，我希望地图上有丰富的事件，且会少量动态刷新，以保持游戏的新鲜感和挑战性。

#### 验收标准

**事件分类与结构：**

1. THE Event_System SHALL 支持多种事件类型，包括但不限于：战斗遭遇、宝箱/拾取、选择题事件（多分支选择），事件类型通过 JSON 配置定义，支持扩展
2. THE Event_System SHALL 支持事件包含多个选择分支，每个分支可定义确定性结果或概率性结果（结果的随机性不直接显示在选项文字中）
3. THE Event_System SHALL 支持基于玩家当前状态的逻辑分支判断（如 HP 过低时出现特殊选项、持有特定道具时解锁隐藏分支等）
4. THE Event_System SHALL 将怪物遭遇作为事件的一种，战斗过程以文字叙述形式呈现，预留战斗模块接口供后续扩展
5. WHEN 怪物遭遇事件可能导致玩家死亡时，THE Event_System SHALL 在事件描述中提供预警提示

**事件触发：**

6. WHEN 玩家进入一个包含事件的地块时，THE Event_System SHALL 触发该事件并以弹窗形式展示事件内容
7. WHEN 事件弹窗显示时，THE Event_System SHALL 暂停游戏流程，直到玩家做出响应
8. THE Event_System SHALL 将事件视为一次性触发，事件触发后从该地块移除

**事件刷新：**

9. WHEN 游戏回合数达到 30 的整数倍时，THE Event_System SHALL 对已探索的空白地块以极低概率刷新新事件
10. THE Event_System SHALL 从地形配置和建筑配置中读取刷新概率，建筑可影响其所在地块及周围地块的事件刷新概率
11. THE Event_System SHALL 从地形配置中读取每种地形类型的事件概率权重（如城市不刷怪物、野外地形怪物概率更高、遗迹更可能出现宝物事件等）

**事件配置：**

12. THE Event_System SHALL 支持通过 JSON 配置文件定义和扩展事件内容，便于后续批量新增或修改事件

### 需求 7：通关条件

**用户故事：** 作为玩家，我希望有明确的通关目标，以获得游戏的成就感。

#### 验收标准

**通关流程：**

1. THE Map_Generator SHALL 在地图生成时随机放置传送门（作为建筑），传送门从游戏开始即存在于地图上
2. WHEN 玩家收集齐 3 个圣物碎片并移动到传送门所在地块时，THE Game_System SHALL 判定玩家通关
3. WHEN 玩家未收集齐 3 个圣物碎片时到达传送门，THE Game_System SHALL 提示玩家还需收集的碎片数量，不触发通关
4. THE Game_System SHALL 在界面上显示当前已收集的圣物碎片数量（已收集数 / 3）

**圣物碎片分布：**

5. THE Map_Generator SHALL 将 3 个圣物碎片分散放置在地图不同区域，避免集中
6. THE Game_System SHALL 支持圣物碎片通过多种方式获取：boss 战事件奖励、遗迹建筑探索等，具体获取方式由事件和建筑配置定义

**结算与重开：**

7. WHEN 玩家通关时，THE Game_System SHALL 显示结算界面，包含游戏统计信息（总回合数、探索地块数等）
8. WHEN 结算界面显示后，THE Game_System SHALL 提供"重新开始"和"下一张随机地图"选项

**游戏失败：**

9. IF 玩家 HP 降至 0，THEN THE Game_System SHALL 判定游戏失败并显示失败界面
10. WHEN 游戏失败时，THE Game_System SHALL 允许玩家从 localStorage 自动存档恢复到上一回合开始的状态

### 需求 8：地图渲染与视觉分层

**用户故事：** 作为玩家，我希望地图渲染清晰且有层次感，以获得良好的视觉体验。

#### 验收标准

**渲染层级：**

1. THE Render_Engine SHALL 使用 PixiJS 将地图渲染为五个视觉层级：
   - Layer 0：地形六边形底色（根据地形类型和海拔渲染不同素材，如高海拔草地显示雪地素材）
   - Layer 1：地形装饰（地形细节素材）
   - Layer 2：建筑图标（城市、遗迹、灯塔、传送门等建筑素材）
   - Layer 3：玩家、怪物与事件标记
   - Layer 4：迷雾层（三态：纯黑色/半透明/无）
2. THE Render_Engine SHALL 按照 Layer 0 至 Layer 4 的顺序从底层到顶层依次渲染

**素材支持：**

3. THE Render_Engine SHALL 支持为每种地形类型加载对应的图片素材，不同地形×海拔组合可配置不同素材（如高山草地用雪地素材、低海拔森林用深绿素材等）
4. THE Render_Engine SHALL 支持为每种建筑类型加载对应的图片素材
5. THE Render_Engine SHALL 从地形配置和建筑配置中读取素材路径，支持数据驱动扩展
6. THE Render_Engine SHALL 在素材缺失时回退到默认颜色填充或 Emoji 显示

**性能要求：**

7. THE Render_Engine SHALL 仅渲染当前视口范围内可见的地块，视口外的地块不参与渲染计算
8. THE Render_Engine SHALL 确保地图拖拽和缩放操作流畅，无明显闪烁或卡顿
9. THE Render_Engine SHALL 对素材进行预加载和缓存，避免运行时重复加载

**视觉增强：**

10. THE Render_Engine SHALL 为高海拔地块实现基于海拔差的动态阴影效果（如 CSS drop-shadow），阴影强度和方向根据 Δe 动态计算，以增强 2.5D 视觉层次感

**UI 弹窗层：**

11. THE Render_Engine SHALL 将事件对话框、结算界面等 UI 弹窗渲染在所有地图层级之上，弹窗不参与地图的拖拽和缩放

### 需求 9：地图交互操作

**用户故事：** 作为玩家，我希望能够方便地浏览地图、查看地块信息并控制角色移动。

#### 验收标准

**地图浏览：**

1. WHEN 玩家在地图上执行 pointerdown 并 pointermove 操作时，THE Render_Engine SHALL 平滑拖拽移动地图视口
2. WHEN 玩家在触屏设备上执行双指缩放（Pinch Zoom）手势时，THE Render_Engine SHALL 对地图进行缩放
3. WHEN 玩家在 PC 端使用鼠标滚轮时，THE Render_Engine SHALL 对地图进行缩放
4. THE Game_System SHALL 提供"居中到玩家"快捷按钮，点击后视口平滑移动至玩家当前位置

**地块选中与移动：**

5. WHEN 玩家点击一个地块时，THE Game_System SHALL 将该地块标记为选中状态，并显示地块信息（地形类型、海拔、建筑、事件标记、移动所需 AP 消耗等）
6. WHEN 玩家点击一个已选中的相邻可达地块时，THE Movement_System SHALL 执行移动操作并触发相应事件
7. WHEN 玩家点击一个不相邻的地块时，THE Game_System SHALL 仅显示该地块信息，不执行移动

**跨平台兼容：**

8. THE Render_Engine SHALL 适配不同尺寸的视口，确保地图在网页浏览器、手机浏览器等不同平台下正常显示
9. THE Game_System SHALL 同时支持触屏操作和鼠标操作


### 需求 10：存档导出与导入

**用户故事：** 作为玩家，我希望能够导出和导入游戏存档，以便保存和恢复游戏进度。

#### 验收标准

**手动导出：**

1. WHEN 玩家点击"导出存档"按钮时，THE Save_System SHALL 将当前完整 GameState 序列化为 JSON 文本，并支持复制到剪贴板和下载为文件两种导出方式

**手动导入：**

2. WHEN 玩家导入一段 JSON 文本（粘贴或选择文件）时，THE Save_System SHALL 反序列化该 JSON 并完整恢复 GameState，包括地图状态、玩家属性、背包物品、回合数和状态效果
3. IF 导入的 JSON 格式无效或数据不完整，THEN THE Save_System SHALL 拒绝导入并向玩家显示错误提示信息
4. FOR ALL 有效的 GameState 对象，导出为 JSON 后再导入 SHALL 产生与原始状态等价的 GameState（往返一致性）

**自动存档：**

5. THE Save_System SHALL 在每回合开始时（过夜事件结算完毕后）自动将当前 GameState 存储到 localStorage
6. WHEN 玩家重新打开游戏时，THE Save_System SHALL 检测 localStorage 中是否存在自动存档，若存在则提示玩家是否继续上次游戏

**版本兼容：**

7. THE Save_System SHALL 在每个存档中包含游戏版本号
8. THE Save_System SHALL 支持向前兼容，旧版本存档在新版本游戏中可正常加载，缺失的新字段使用默认值填充

### 需求 11：（已删除）

### 需求 12：玩家生命值管理

**用户故事：** 作为玩家，我希望生命值系统能准确反映我受到的伤害和恢复，以便做出生存决策。

#### 验收标准

**基础 HP 规则：**

1. THE Game_System SHALL 将玩家初始 HP 设置为 100，初始 HP 上限为 100
2. THE Game_System SHALL 确保玩家 HP 不低于 0 且不超过当前 HP 上限
3. IF 玩家 HP 降至 0，THEN THE Game_System SHALL 立即结束游戏并显示失败界面

**HP 上限变动：**

4. THE Game_System SHALL 支持通过道具、事件奖励或战斗奖励提升玩家 HP 上限
5. THE Game_System SHALL 支持事件效果降低玩家 HP 上限（如诅咒、中毒后遗症等）
6. THE Game_System SHALL 支持事件效果直接回复玩家 HP（如发现泉水、获得治疗等）

**伤害来源：**

7. WHEN 玩家因下坡摔伤受到伤害时，THE Game_System SHALL 从玩家当前 HP 中扣除相应数值
8. WHEN 玩家因战斗事件受到伤害时，THE Game_System SHALL 从玩家当前 HP 中扣除相应数值（战斗系统预留接口，当前版本以文字叙述结算）
9. WHEN 玩家进入地形配置中定义有进入伤害的地块时（如熔岩），THE Game_System SHALL 立即结算该地形的进入伤害，可被对应道具抵消
10. WHEN 玩家在有伤害效果的地块上结束回合时，THE Game_System SHALL 额外结算该地形的休息伤害
11. WHEN 玩家进入有概率性负面效果的地块时（如沼泽中毒），THE Game_System SHALL 按地形配置中定义的概率判定是否触发负面效果

**伤害减免：**

12. THE Game_System SHALL 支持道具提供概率性伤害免疫效果（如四叶草），免疫概率与本次伤害值相关（伤害越高免疫概率越低），具体规则由道具配置定义
13. THE Game_System SHALL 预留防御/护甲减伤机制的接口，供后续战斗系统扩展

### 需求 13：道具系统

**用户故事：** 作为玩家，我希望能够收集和使用道具，以克服地形障碍和获得各种增益。

#### 验收标准

**道具持有规则：**

1. THE Game_System SHALL 支持玩家持有道具，道具一旦获得即永久持有，无耐久度、无使用次数、无容量上限
2. THE Game_System SHALL 不支持玩家主动丢弃道具
3. THE Game_System SHALL 支持事件中以交换形式获取道具（交出一个已有道具，获得一个更好的道具）

**道具属性与配置：**

4. THE Game_System SHALL 为每种道具定义品质等级，高品质道具的获取难度更高
5. THE Map_Generator SHALL 保证同一张地图内不出现重复道具
6. THE Map_Generator SHALL 仅在地图中生成与当前地图地形和建筑相关的道具（如地图无熔岩则不生成防火靴），避免出现无用道具
7. THE Map_Generator SHALL 保证地图中存在需要特定道具才能通行的地形时，该道具一定会在地图中生成且可获取（如有水域则一定有船）
8. THE Map_Generator SHALL 区分完全不可达地形（如水域无船不可进入）和有代价可达地形（如熔岩无防火靴可进入但掉血）：完全不可达地形所需的道具不能放置在该地形上，有代价可达地形的道具可以放置在该地形上
8. THE Game_System SHALL 支持通过 JSON 配置文件定义和扩展道具类型，每种道具包含名称、描述、品质、图标素材和效果，便于后续批量新增或修改道具

**道具效果类型：**

8. THE Game_System SHALL 支持道具提供多种效果类型，包括但不限于：地形通行（钩爪、降落伞、船只、防火靴等）、AP 上限提升（鞋子等）、视野增加（望远镜等）、休息增强（帐篷等）、伤害免疫（四叶草等）、负面效果抵消（解毒药等）、剩余 AP 结转或转化等
9. THE Game_System SHALL 支持规则改变类道具，此类道具可修改游戏核心规则（如改变移动消耗计算方式、允许跳格移动、屏蔽特定事件触发等），具体规则修改由道具配置定义
10. WHEN 玩家尝试进入需要特定道具的地块时，THE Movement_System SHALL 检查玩家是否持有地形配置中定义的所需道具

**道具启用/禁用：**

11. THE Game_System SHALL 支持道具的启用和禁用状态，玩家可以主动切换道具的启用/禁用
12. THE Game_System SHALL 仅对处于启用状态的道具应用其效果，禁用状态的道具不产生任何效果（包括正面和负面效果）

**道具展示：**

13. THE Game_System SHALL 在 HUD 区域直接罗列展示玩家当前持有的所有道具图标，禁用状态的道具以灰色或其他视觉区分显示

### 需求 14：建筑与设施系统

**用户故事：** 作为玩家，我希望地图上有各种建筑和设施，为探索提供额外的策略选择和资源。

#### 验收标准

**基础规则：**

1. THE Game_System SHALL 支持在地块上放置建筑/设施，建筑作为独立于地形的叠加层，一个地块最多放置一个建筑
2. THE Game_System SHALL 将建筑设为固定不变，建筑在游戏过程中不会被破坏或消失
3. WHEN 玩家进入有建筑的地块时，THE Game_System SHALL 自动触发该建筑的效果，无需玩家主动交互

**建筑类型与配置：**

4. THE Game_System SHALL 通过 JSON 配置文件定义建筑类型（如灯塔、营地、城市、遗迹、传送门、传送阵、洞穴、农田、矿坑、怪物营地、漩涡等），每种建筑包含名称、描述、图标素材、效果和放置规则，支持数据驱动扩展
5. THE Game_System SHALL 支持建筑提供多种效果类型：视野增加、AP 临时增加、HP 回复增强、事件概率修正、道具获取、触发事件（如遗迹触发探索事件）等

**传送阵：**

6. THE Game_System SHALL 支持传送阵建筑成对出现，WHEN 玩家进入一个传送阵时，THE Game_System SHALL 自动将玩家传送到与之配对的另一个传送阵所在地块

**建筑放置约束：**

7. THE Map_Generator SHALL 从建筑配置中读取每种建筑允许放置的地形类型列表（如城市不能放在水域上，漩涡只能放在水域上等）
8. THE Map_Generator SHALL 从建筑配置中读取建筑之间的相邻约束规则（如城市不能与怪物营地相邻等）
9. THE Map_Generator SHALL 支持在随机生成和预设地图中放置建筑，建筑分布由地图配置和约束规则共同决定

**渲染：**

10. THE Render_Engine SHALL 在 Layer 2（建筑层）上渲染建筑图标，使其在地形之上可见

### 需求 15：游戏界面布局

**用户故事：** 作为玩家，我希望游戏界面简洁清晰，地图占据主要空间，同时能方便地查看关键信息。

#### 验收标准

1. THE Game_System SHALL 将地图区域作为主体，占据屏幕绝大部分空间
2. THE Game_System SHALL 在界面上以紧凑的 HUD 形式持续显示关键信息：当前 AP（当前值/上限值）、HP（当前值/上限值）、回合数、已收集圣物碎片数、已持有道具图标列表
3. THE Game_System SHALL 支持点击道具图标查看道具详细信息（名称、描述、效果）
4. THE Game_System SHALL 提供功能按钮区域，包含：结束回合、导出存档、导入存档、居中到玩家等操作按钮
5. THE Game_System SHALL 确保 HUD 和按钮在不同屏幕尺寸下不遮挡地图核心区域，布局自适应
6. THE Game_System SHALL 确保界面布局兼容网页浏览器和手机浏览器，预留未来适配小程序/App 的能力
