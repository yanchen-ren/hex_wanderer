# 实施计划 v1.1：道具扩展、状态效果、金币系统

## 概述

基于 v1.0 核心游戏，新增 60 个道具（含组合）、状态效果系统、金币系统、摔伤对话框、教堂建筑等。不含自动寻路。

## 任务

- [x] 1. 金币系统
  - [x] 1.1 PlayerState 新增 gold 属性，默认 0，toJSON/fromJSON 支持
  - [x] 1.2 HUD 显示金币数量
  - [x] 1.3 事件系统支持 gold_change 结果类型（增减金币）
  - [x] 1.4 事件选项支持 gold_cost 条件（金币不足时不可选）
  - [ ]* 1.5 金币系统单元测试

- [x] 2. 状态效果系统重构
  - [x] 2.1 重构 PlayerState 状态效果：支持 poison/frostbite/curse/bleed 四种 debuff，每种有独立的 effect 定义
    - poison：回合结束按 HP 百分比掉血
    - frostbite：AP 消耗 +1，回合结束掉少量 HP
    - curse：战斗伤害大幅增加，持续 5+ 回合
    - bleed：当回合内每次移动掉 HP，1 回合自动消失
  - [x] 2.2 TurnSystem 回合结束结算 debuff 效果（poison 掉血、frostbite 掉血）
  - [x] 2.3 MovementSystem 移动时结算 bleed 和 frostbite AP 加成
  - [x] 2.4 场地效果：荒漠干渴（概率触发，扣 AP+HP，水杯/万能药免疫）
  - [x] 2.5 HUD 显示当前活跃 debuff 图标及剩余回合数
  - [x] 2.6 城市休息解除所有 debuff，教堂解除诅咒
  - [ ]* 2.7 状态效果单元测试

- [x] 3. 消耗型道具机制
  - [x] 3.1 ItemSystem 新增 consumeItem(itemId) 方法
  - [x] 3.2 ItemSystem 新增 isConsumable(itemId) 查询（从配置读取）
  - [x] 3.3 item.json 道具配置新增 consumable 字段
  - [ ]* 3.4 消耗型道具单元测试

- [x] 4. 道具组合系统
  - [x] 4.1 ItemSystem 新增 checkCombinations() 方法，每次 addItem 后自动检查
  - [x] 4.2 item.json 新增 combinations 配置区（10 个组合配方）
  - [x] 4.3 组合触发时弹出消息框通知玩家
  - [ ]* 4.4 道具组合单元测试

- [x] 5. 摔伤对话框与流血
  - [x] 5.1 MovementSystem 摔伤时不再静默扣血，改为返回摔伤事件数据
  - [x] 5.2 GameLoop 收到摔伤数据后弹出消息框（显示掉血数值 + 流血状态）
  - [x] 5.3 降落伞选择框：摔伤时如果有降落伞，先弹选择框决定是否使用
  - [x] 5.4 摔伤概率附加 bleed 状态

- [x] 6. 扩展道具配置（item.json）
  - [x] 6.1 写入全部 50 个基础道具到 item.json（含效果定义）
  - [x] 6.2 写入 10 个组合配方到 item.json combinations 区
  - [x] 6.3 为每个道具效果类型实现 ItemSystem handler：
    - terrain_pass, fall_immunity, ap_max_bonus, vision_bonus, rest_hp_bonus
    - damage_immunity_chance, status_immunity, combat_damage_reduction
    - ap_cost_modifier（车/攀爬手套/羽毛/魔女扫帚）
    - event_option_unlock（炸弹/面具/锄头/芭蕉扇等）
    - gold_bonus（盗贼勋章/磁铁/金盏花）
    - curse_immunity（鞭子/法老权杖/法老法典）
    - earphone_hint（万能耳机推荐标记）
    - lethal_save（安全帽/重生十字架）
    - hourglass_retry（沙漏重选）
    - mystery_egg_timer（神秘蛋延时孵化）
    - sell_in_city（珍珠/法老权杖）

- [x] 7. 教堂建筑
  - [x] 7.1 building.json 新增教堂（church）配置
  - [x] 7.2 BuildingSystem 教堂效果：进入后解除诅咒
  - [x] 7.3 MapGenerator 放置教堂（allowedTerrains: grass/desert）

- [x] 8. 事件扩展
  - [x] 8.1 event.json 新增道具相关事件（挖掘、毒蛇、不死族、强盗、毒气洞窟等）
  - [x] 8.2 事件选项支持 has_item 条件解锁更多道具选项（防护服/炸弹/面具/锄头等）
  - [x] 8.3 事件选项支持 gold_cost 条件（贿赂公文包等）
  - [x] 8.4 万能耳机效果：EventSystem 在显示选项时小概率标记推荐

- [x] 9. 道具联动效果
  - [x] 9.1 手风琴 + 火把 → 篝火晚会（过夜事件升级）
  - [x] 9.2 无尽水杯 + 金盏花 → 增强金币产出
  - [x] 9.3 牛仔帽遇毒蛇必中毒
  - [x] 9.4 盗贼勋章城市过夜被抓 / 警长勋章城市过夜加成
  - [x] 9.5 猎犬战后概率死亡
  - [x] 9.6 神秘蛋 5 回合后孵化事件

- [x] 10. MapGenerator 道具放置更新
  - [x] 10.1 更新道具放置逻辑支持 60 个道具
  - [x] 10.2 消耗品可在地图上出现多次（非唯一）
  - [x] 10.3 组合材料确保成对出现在地图上

- [x] 11. 检查点 — 完整验证
  - 确保所有新功能可玩，道具效果正确，状态效果正常结算。

## 备注

- 自动寻路功能不在本次计划中，后续单独实现
- 标记 `*` 的子任务为可选测试任务
- 道具数值（伤害减免百分比、金币数量等）后续可通过 JSON 配置调整
