# 需求文档

## 简介

HexWanderer（六边形浪游者）是一款轻量级、基于 H5 的六边形地块探索 Roguelike 游戏。玩家在迷雾笼罩的随机生成地图中，通过消耗行动力（AP）在六边形地块间移动，经历随机事件，收集圣物碎片（数量随地图尺寸变化）并抵达传送门以完成通关。游戏使用 PixiJS 引擎渲染，纯 JavaScript (ES6+) 实现，支持存档导入导出。

## 术语表

- **Game_System**: HexWanderer 游戏系统的总称
- **Map_Generator**: 负责随机生成六边形地图的模块
- **Movement_System**: 处理玩家在六边形地块间移动及 AP 消耗的模块
- **Event_System**: 管理地块事件触发与动态刷新的模块
- **Render_Engine**: 基于 PixiJS 的游戏渲染引擎
- **Save_System**: 负责游戏状态导出、导入与自动存档的模块
- **Turn_System**: 管理回合流转、AP 回复与休息效果的模块
- **Fog_System**: 管理战争迷雾显示与视野计算的模块
- **AP（行动力）**: Action Points，玩家每回合可用于移动的资源，初始上限为 8
- **HP（生命值）**: Health Points，玩家的生命值，初始为 100
- **Gold（金币）**: 玩家的货币资源，通过事件、战斗、挖掘等方式获取，在城市商店或特定事件中消费
- **海拔差（Δe）**: 两个相邻地块之间的海拔高度差值
- **Axial_Coordinates**: 六边形网格的轴坐标系，使用 (q, r) 表示
- **圣物碎片**: 分布在地图极值坐标处的收集物品，数量根据地图尺寸随机决定（小地图 3-4 个，中地图 3-5 个，大地图 4-5 个）
- **传送门**: 收集齐全部圣物碎片后生成的通关出口
- **GameState**: 包含完整游戏状态的 JSON 数据对象
- **Terrain_Config**: 地形类型配置文件，定义每种地形的移动消耗、通行条件、休息效果、事件概率、视野修正等属性，支持 JSON 数据驱动扩展
- **Building_Config**: 建筑/设施配置文件，定义每种建筑的效果、影响范围和触发条件，独立于地形叠加在地块上，支持 JSON 数据驱动扩展
- **Pathfinding_System**: 自动寻路模块，基于 A*/Dijkstra 算法计算最短路径，考虑道具对通行和 AP 消耗的影响

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
8. WHEN 地图生成完成时，THE Map_Generator SHALL 根据地图尺寸随机放置圣物碎片：小地图(25×25) 放置 3-4 个，中地图(50×50) 放置 3-5 个，大地图(75×75) 放置 4-5 个，具体数量由种子随机决定
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
7. WHEN 海拔差 Δe 为 -1 至 -2 且玩家未持有降落伞时，THE Movement_System SHALL 以 10% 概率造成 15 点 HP 摔伤，并以消息框明确告知玩家摔伤及掉血数值，概率附加流血状态
8. WHEN 海拔差 Δe 为 -3 且玩家未持有降落伞时，THE Movement_System SHALL 以 40% 概率造成 40 点 HP 摔伤，并以消息框明确告知玩家摔伤及掉血数值，概率附加流血状态
9. WHEN 海拔差 Δe 小于等于 -4 且玩家未持有降落伞时，THE Movement_System SHALL 阻止该次移动并提示玩家需要降落伞
10. WHEN 玩家持有降落伞道具且下坡触发摔伤时，THE Movement_System SHALL 弹出选择框让玩家决定是否使用降落伞：使用则免疫本次摔伤并消耗降落伞，不使用则承受伤害

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

1. THE Turn_System SHALL 在每个新回合开始时将玩家 AP 恢复至当前 AP 上限（初始上限为 8）
2. WHEN 玩家 AP 降至 0 时，THE Game_System SHALL 提示玩家 AP 已耗尽，玩家需手动点击"结束回合"按钮结束当前回合
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

1. THE Fog_System SHALL 将地块分为三种可见状态：未探索（纯黑色，完全不可见）、已探索但不在视野内（半透明，可见地形和建筑但不显示事件和怪物）、在视野内（完全可见，显示所有信息）
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
12. THE Fog_System SHALL 支持建筑效果（如灯塔、瞭望塔）永久揭开周围迷雾，揭开的区域不会因玩家离开而重新变为半透明
13. THE Fog_System SHALL 支持事件效果（如日食）临时将视野强制设为指定值，持续指定回合数后恢复

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
10. THE Event_System SHALL 从地形配置和建筑配置中读取刷新概率，事件刷新不会在建筑地块上放置随机事件（建筑有自己的事件系统）
11. THE Event_System SHALL 从地形配置中读取每种地形类型的事件概率权重（如城市不刷怪物、野外地形怪物概率更高、遗迹更可能出现宝物事件等）

**事件配置：**

12. THE Event_System SHALL 支持通过 JSON 配置文件定义和扩展事件内容，便于后续批量新增或修改事件

### 需求 7：通关条件

**用户故事：** 作为玩家，我希望有明确的通关目标，以获得游戏的成就感。

#### 验收标准

**通关流程：**

1. THE Map_Generator SHALL 在地图生成时随机放置传送门（作为建筑），传送门从游戏开始即存在于地图上
2. WHEN 玩家收集齐全部圣物碎片（数量由地图尺寸决定）并移动到传送门所在地块时，THE Game_System SHALL 判定玩家通关
3. WHEN 玩家未收集齐全部圣物碎片时到达传送门，THE Game_System SHALL 提示玩家还需收集的碎片数量，不触发通关
4. THE Game_System SHALL 在界面上显示当前已收集的圣物碎片数量（已收集数 / 所需总数）

**圣物碎片分布：**

5. THE Map_Generator SHALL 将圣物碎片分散放置在地图不同区域，避免集中，候选位置包括地图四角和底部中央等极值坐标
6. THE Game_System SHALL 支持圣物碎片通过多种方式获取：boss 战事件奖励、遗迹建筑探索等，具体获取方式由事件和建筑配置定义
7. THE Game_System SHALL 在玩家已收集齐全部碎片后再获得碎片时，将多余碎片折算为金币奖励

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
7. WHEN 玩家点击一个不相邻的已探索地块时，THE Game_System SHALL 计算并显示到该地块的最短路径及总 AP 消耗（详见需求 16：自动寻路系统）
8. WHEN 玩家点击一个不相邻的未探索地块时，THE Game_System SHALL 仅显示该地块信息，不执行移动

**跨平台兼容：**

8. THE Render_Engine SHALL 适配不同尺寸的视口，确保地图在网页浏览器、手机浏览器等不同平台下正常显示，包括横竖屏切换时自动重新居中相机到玩家位置
9. THE Game_System SHALL 同时支持触屏操作和鼠标操作
10. THE Render_Engine SHALL 确保 `window` 上的 `resize` 事件监听器不会因游戏重启而重复累积，每次初始化时移除旧监听器后再添加新的


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

### 需求 12.5：状态效果系统

**用户故事：** 作为玩家，我希望异常状态有明确的效果和解除方式，以便做出策略决策。

#### 验收标准

**异常状态（Debuff）：**

1. THE Game_System SHALL 支持中毒（poison）状态：回合结束时按当前 HP 百分比掉血，持续 3 回合
2. THE Game_System SHALL 支持冻伤（frostbite）状态：所有 AP 消耗增加 +1，回合结束时掉少量 HP，持续 2 回合
3. THE Game_System SHALL 支持诅咒（curse）状态：战斗中受到的伤害大幅增加，持续 5+ 回合，来源为不死族战斗或陷阱事件
4. THE Game_System SHALL 支持流血（bleed）状态：当回合内每次移动都会掉一定 HP，仅持续 1 回合，回合结束自动消失
5. THE Game_System SHALL 支持通过道具免疫或解除特定状态（解毒药在中毒后弹出使用选项并消耗、火把免疫冻伤、鞭子/法老权杖/法老法典免疫诅咒、大蒜概率解除诅咒）
6. THE Game_System SHALL 支持通过建筑解除状态（教堂解除诅咒、城市/城堡休息解除所有 debuff）
7. THE Game_System SHALL 支持万能药（elixir）在回合结束时自动移除所有负面状态

**场地效果（即时结算，非持续 Debuff）：**

7. WHEN 玩家在荒漠地形行动时，THE Game_System SHALL 以一定概率触发干渴效果，降低少量 AP 和少量 HP，可被无尽水杯免疫
8. WHEN 玩家进入熔岩地形时，THE Game_System SHALL 触发灼伤效果扣除 HP，可被防火靴免疫

**状态显示：**

9. THE Game_System SHALL 在 HUD 上显示当前所有活跃的异常状态及其剩余回合数

### 需求 13：道具系统

**用户故事：** 作为玩家，我希望能够收集和使用道具，以克服地形障碍和获得各种增益。

#### 验收标准

**道具持有规则：**

1. THE Game_System SHALL 支持玩家持有道具，道具一旦获得即永久持有，无耐久度、无使用次数、无容量上限
2. THE Game_System SHALL 不支持玩家主动丢弃道具
3. THE Game_System SHALL 支持事件中以交换形式获取道具（交出一个已有道具，获得一个更好的道具）

**消耗型道具：**

4. THE Game_System SHALL 支持消耗型道具，此类道具触发效果后从背包移除（如安全帽、重生十字架、沙漏、炸弹）
5. WHEN 玩家受到致命伤害且持有安全帽时，THE Game_System SHALL 保留玩家 1 HP 并消耗安全帽
6. WHEN 玩家受到致命伤害且持有重生十字架或法老法典（无安全帽）时，THE Game_System SHALL 满血重生并消耗该道具（法老法典为不可消耗的传说道具，触发后保留）
7. THE Game_System SHALL 通过数据驱动方式检查所有持有道具的 lethal_save 效果，优先触发保留 1HP 的效果，再触发满血复活的效果

**道具组合系统：**

7. THE Game_System SHALL 支持道具组合，当玩家同时拥有两个指定道具时自动组合为新道具，原材料消失
8. THE Game_System SHALL 通过 JSON 配置文件定义组合配方（材料 A + 材料 B → 结果道具）

**金币系统：**

9. THE Game_System SHALL 支持金币（Gold）作为玩家货币资源，通过事件、战斗、挖掘等方式获取
10. THE Game_System SHALL 在 HUD 上显示当前金币数量
11. WHEN 事件选项需要消耗金币且玩家金币不足时，THE Event_System SHALL 将该选项标记为不可选

**事件中的道具交互：**

12. THE Event_System SHALL 支持根据玩家持有的道具解锁额外的事件选项（如持有炸弹解锁[炸开]选项，持有面具解锁[伪装]选项）
13. THE Event_System SHALL 支持万能耳机效果：持有时小概率在正面效果选项后显示推荐标记（🎧）

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

4. THE Game_System SHALL 通过 JSON 配置文件定义建筑类型（如灯塔、营地、城市、城堡、遗迹、传送门、传送阵、洞穴、农田、矿坑、怪物营地、漩涡、教堂、瞭望塔、训练场、祭坛、泉水、许愿池、村庄等），每种建筑包含名称、描述、图标素材、效果和放置规则，支持数据驱动扩展
5. THE Game_System SHALL 支持建筑提供多种效果类型：视野增加、AP 临时增加、HP 回复增强、事件概率修正、道具获取、触发事件（如遗迹触发探索事件）、随机传送（漩涡）、被动 AP 恢复（泉水）、清除诅咒（教堂）、永久属性提升（训练场/城堡）等
6. THE Game_System SHALL 支持建筑事件的一次性触发（灯塔、遗迹、洞穴、城堡等触发后事件消失）和可重复触发（祭坛、村庄、树洞等每次到达都可触发）

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
2. THE Game_System SHALL 在界面上以紧凑的 HUD 形式持续显示关键信息：当前 AP（当前值/上限值）、HP（当前值/上限值）、回合数、已收集圣物碎片数、金币数量、已持有道具图标列表、当前活跃的异常状态及剩余回合数
3. THE Game_System SHALL 支持点击道具图标查看道具详细信息（名称、描述、效果）
4. THE Game_System SHALL 提供功能按钮区域，包含：结束回合、导出存档、导入存档、居中到玩家等操作按钮
5. THE Game_System SHALL 确保 HUD 和按钮在不同屏幕尺寸下不遮挡地图核心区域，布局自适应
6. THE Game_System SHALL 确保界面布局兼容网页浏览器和手机浏览器，预留未来适配小程序/App 的能力

### 需求 16：自动寻路系统

**用户故事：** 作为玩家，我希望能够点击远处的地块后自动规划并执行移动路径，以减少重复的手动点击操作。

#### 验收标准

**路径计算：**

1. WHEN 玩家点击一个不相邻的已探索地块时，THE Movement_System SHALL 使用 A* 或 Dijkstra 算法计算从玩家当前位置到目标地块的最短路径（以 AP 消耗为权重）
2. THE Movement_System SHALL 在路径计算时考虑玩家当前持有的道具对通行能力的影响：
   - 无钩爪时，海拔差 >3 的上坡不可通行
   - 无降落伞时，海拔差 ≤-4 的下坡不可通行
   - 无船只时，水域地块不可通行
   - 无防火靴时，熔岩地块可通行但有进入伤害
3. THE Movement_System SHALL 在路径计算时考虑道具对 AP 消耗的修正（如越野车降低草地/沙漠消耗、羽毛降低下坡消耗、攀岩手套降低上坡消耗等）
4. IF 目标地块不可达（被不可通行地形完全阻隔），THEN THE Game_System SHALL 提示玩家"目标不可达"，不显示路径
5. THE Movement_System SHALL 仅在已探索（explored 或 visible）的地块上规划路径，未探索地块视为不可通行，不允许穿越
6. THE Movement_System SHALL 在路径计算时不回避可能造成摔伤的下坡路线（摔伤是概率性的，由玩家自行判断风险）

**路径显示：**

7. WHEN 路径计算完成时，THE Render_Engine SHALL 在地图上高亮显示完整路径上的每个地块，高亮效果与选中地块的黄色高亮不同（使用不同颜色或样式区分）
8. THE Render_Engine SHALL 在路径上标注总 AP 消耗，以及当前回合 AP 能走到的最远位置
9. THE Game_System SHALL 在路径显示时提供"出发"按钮，玩家点击后开始自动移动

**自动移动执行：**

10. WHEN 玩家点击"出发"按钮后，THE Movement_System SHALL 按路径逐步执行移动，每步消耗对应的 AP，每步之间有约 1 秒的延迟让玩家看到角色移动过程
11. WHEN 自动移动途中遇到地块事件（战斗、宝箱、选择事件等）时，THE Game_System SHALL 暂停自动移动，弹出事件对话框，事件处理完毕后继续沿路径移动
12. WHEN 自动移动途中遇到建筑效果（传送阵、泉水等）时，THE Game_System SHALL 暂停自动移动并触发建筑效果，效果处理完毕后继续沿路径移动
13. WHEN 自动移动途中触发摔伤弹窗（降落伞选择）时，THE Game_System SHALL 暂停自动移动，处理完摔伤后继续沿路径移动
14. WHEN 自动移动途中玩家被传送（传送阵、漩涡、事件随机传送）时，THE Game_System SHALL 清除当前路径
15. WHEN 自动移动途中玩家 AP 耗尽时，THE Game_System SHALL 停止自动移动，保留剩余路径
16. WHEN 玩家在自动移动过程中点击地图其他位置或点击"取消"按钮时，THE Game_System SHALL 立即停止自动移动并清除当前路径

**路径跨回合保留：**

17. WHEN 玩家 AP 耗尽导致自动移动停止时，THE Game_System SHALL 保留从当前位置到目标地块的剩余路径
18. WHEN 新回合开始（过夜结束）后，THE Game_System SHALL 继续显示保留的剩余路径，玩家可点击"继续出发"按钮恢复自动移动
19. WHEN 玩家在新回合中手动移动到路径外的地块时，THE Game_System SHALL 清除保留的路径
20. THE Save_System SHALL 在存档中保存当前保留的路径目标位置，读档后重新计算路径

**路径取消与更新：**

21. WHEN 玩家点击新的远端地块时，THE Game_System SHALL 清除旧路径并计算新路径
22. WHEN 玩家获得或失去影响通行能力的道具时（如获得船只、失去钩爪），THE Game_System SHALL 在下次路径计算时使用更新后的道具状态
23. THE Game_System SHALL 支持点击玩家自身地块或按 ESC 键清除当前路径

### 需求 17：虚空地形

**用户故事：** 作为地图编辑器用户，我希望能够标记永远不可达的地块，以创建非矩形的地图形状。

#### 验收标准

1. THE Map_Generator SHALL 支持 `void` 地形类型，该地形永远不可通行、不可探索
2. THE Render_Engine SHALL 不为 void 地块渲染任何地形素材，保持空白
3. THE Fog_System SHALL 将 void 地块永远标记为未探索（纯黑色），不受视野影响
4. THE Movement_System SHALL 将 void 地块视为不可通行，阻止任何移动
5. THE Pathfinding_System SHALL 将 void 地块视为不可穿越，不纳入路径计算
6. THE Map_Generator SHALL 在正常随机生成模式下不使用 void 地形，仅供地图编辑器使用

### 需求 18：道具效果系统完善

**用户故事：** 作为玩家，我希望所有道具的效果都能在游戏中实际生效。

#### 验收标准

1. THE Game_System SHALL 支持 npcFriendly 效果（外交官套装）：非战斗事件中好结果概率提升 15%
2. THE Game_System SHALL 支持 combatNoDamageOnWin 效果（大师之剑）：战斗胜利（获得奖励）时免除 HP 损失
3. THE Game_System SHALL 支持 combatSurrenderChance 效果（法老法典）：战斗中 30% 概率出现"劝降"选项
4. THE Game_System SHALL 支持 ruinLootUpgrade 效果（钻头）：遗迹/洞穴/矿坑探索时 common 道具池升级为 rare
5. THE Game_System SHALL 支持 luckModifier 效果（奇异宝石）：所有概率性结果中好结果概率提升
6. THE Game_System SHALL 支持 trapImmunity 效果（盾牌）：陷阱类伤害免疫
7. THE Game_System SHALL 支持 bribe 效果（公文包/外交官套装）：战斗中解锁"花钱贿赂"选项
8. THE Game_System SHALL 支持 scare 效果（稻草人/气球）：战斗中概率出现"吓唬敌人"选项
9. THE Game_System SHALL 支持 beast_flute 效果（唤兽笛）：战斗中注入"召唤伙伴助战"选项
10. THE Game_System SHALL 确保所有道具可通过事件获得，合成材料可通过事件获得
11. THE Game_System SHALL 在道具已拥有或被合成阻断时，将重复获得的道具折算为金币（品质价格的 50%）

### 需求 19：后期难度递增

**用户故事：** 作为玩家，我希望游戏后期有更大的挑战，避免道具积累后难度过低。

#### 验收标准

1. THE Game_System SHALL 从配置文件 (difficulty.json) 读取难度递增参数
2. WHEN 回合数超过配置的起始回合时，THE Game_System SHALL 按配置的间隔和增幅递增战斗伤害倍率
3. THE Game_System SHALL 将缩放后的战斗伤害限制在配置的最大伤害上限内
4. WHEN 回合数超过配置的起始回合时，THE Game_System SHALL 按配置的间隔和增幅递增商人交易物价
5. THE Game_System SHALL 不改变任何途径获得的金币数量，仅增加消费成本
6. THE Game_System SHALL 支持伤害递增和物价递增使用独立的配置参数

### 需求 20：加载页面

**用户故事：** 作为玩家，我希望游戏加载时有视觉反馈，而不是空白等待。

#### 验收标准

1. THE Game_System SHALL 在页面加载时立即显示加载页面（不依赖任何 CDN 库）
2. THE Game_System SHALL 异步加载 CDN 依赖（Tailwind CSS、PixiJS），加载失败时显示错误提示
3. THE Game_System SHALL 在加载页面显示进度动画（地块序列 + 玩家角色移动）
4. THE Game_System SHALL 在所有资源加载完成后淡出加载页面
5. THE Game_System SHALL 在浏览器标签页显示游戏 Logo 作为 favicon

### 需求 21：传送阵多组生成

**用户故事：** 作为玩家，我希望大地图上有多组传送阵，增加探索的便利性和策略性。

#### 验收标准

1. THE Map_Generator SHALL 根据地图大小生成 1-5 组传送阵对
2. THE Map_Generator SHALL 为每组传送阵分配不同的变体素材（5 种颜色），同一组配对使用相同素材
3. THE Render_Engine SHALL 根据传送阵的组别索引选择对应的变体素材渲染
4. THE BuildingSystem SHALL 正确处理多组传送阵的配对传送逻辑

### 需求 22：素材图标系统

**用户故事：** 作为玩家，我希望游戏界面使用精美的素材图标替代 emoji，提升视觉一致性。

#### 验收标准

1. THE HUD SHALL 使用素材图标显示道具（有素材时用 img，无素材时回退 emoji）
2. THE HUD SHALL 使用素材图标显示 debuff 状态、圣遗物、金币
3. THE Game_System SHALL 在事件对话框中显示道具图标（获得道具、消耗道具、道具效果触发）
4. THE Game_System SHALL 在事件选项中显示触发该选项的道具图标（has_item 条件解锁的选项）
5. THE Game_System SHALL 在地块信息提示中使用建筑素材图标替代 emoji
6. THE HUD SHALL 仅在道具列表或 debuff 列表变化时重建对应 DOM 区域，避免图片重复加载闪烁
