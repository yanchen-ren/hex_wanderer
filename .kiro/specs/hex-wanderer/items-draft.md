# 道具规划草案

## 品质分档

| 品质 | 颜色 | 说明 |
|---|---|---|
| common | 灰色 | 效果单一，容易获取 |
| uncommon | 绿色 | 效果明显，中等难度获取 |
| rare | 蓝色 | 解锁关键能力或地形通行 |
| epic | 紫色 | 改变游戏规则级别 |
| legendary | 橙色 | 组合后的终极道具 |

## 新增系统

### 组合系统
同时拥有两个指定道具时自动组合为新道具，原材料消失。

### 消耗型道具
触发效果后从背包移除：
- 降落伞：玩家选择使用免疫摔伤后消耗（可选择不用）
- 安全帽：致命伤害保留 1 HP 后消耗
- 重生十字架：满血重生后消耗
- 沙漏：回溯对话选择后消耗
- 炸弹：炸开障碍后消耗
- 解毒药：解毒后消耗
- 大蒜：使用后消耗（无论成功或失败）
- 狼毒药剂：狼人事件中使用后消耗
- 烟雾弹：逃跑使用后消耗
- 猎犬：战斗后概率死亡
- 神秘蛋：孵化后消失

致命伤害优先级：安全帽 > 重生十字架

### 道具联动（非组合）
- 手风琴 + 火把 → 过夜晚会升级为篝火晚会
- 无尽水杯 + 金盏花 → 增强金盏花金币产出

### 金币系统
新增玩家属性：金币（gold），HUD 显示。通过事件/战斗/挖掘获取，城市或特定事件中消费。金币不足时相关选项不可选。

---

## 全部道具清单

### 通行类（5 个）

| ID | 名称 | 品质 | 效果 | 消耗 |
|---|---|---|---|---|
| rope_claw | 钩爪 | rare | 攀爬海拔差 >3 的悬崖 | 否 |
| parachute | 降落伞 | rare | 摔伤时弹出选择框，可选择使用免疫摔伤；允许通过悬崖(≤-4) | 是 |
| boat | 船只 | uncommon | 进入水域 | 否 |
| fire_boots | 防火靴 | rare | 进入熔岩 + 免疫熔岩伤害 | 否 |
| bomb | 炸弹 | uncommon | 特定事件中解锁[炸开]选项 | 是 |

### 移动类（5 个）

| ID | 名称 | 品质 | 效果 | 消耗 |
|---|---|---|---|---|
| leather_shoes | 皮靴 | common | AP 上限 +1 | 否 |
| car | 车 | rare | AP 上限 +2，草地/荒漠 AP 消耗大幅降低 | 否 |
| feather | 羽毛 | common | 减少下坡 AP 消耗 | 否 |
| climbing_gloves | 攀爬手套 | common | 爬坡 AP 消耗减半 | 否 |
| witch_broom | 魔女的扫帚 | epic | 所有地形 AP 消耗减少，免疫摔伤 | 否 |

### 防御类（5 个）

| ID | 名称 | 品质 | 效果 | 消耗 |
|---|---|---|---|---|
| vest | 防弹背心 | common | 战斗伤害减少 15% | 否 |
| chainmail | 锁子甲 | uncommon | 战斗伤害减少 35%，AP 上限 -1 | 否 |
| helmet | 安全帽 | rare | 致命伤害时保留 1 HP | 是 |
| shield | 盾牌 | uncommon | 对话选错触发陷阱时免除扣血 | 否 |
| blue_sweater | 蓝色毛衣 | common | 小幅减少所有伤害 | 否 |

### 生存类（5 个）

| ID | 名称 | 品质 | 效果 | 消耗 |
|---|---|---|---|---|
| tent | 帐篷 | common | 休息时额外回复 10 HP | 否 |
| four_leaf_clover | 四叶草 | epic | 概率免疫伤害（伤害越高概率越低） | 否 |
| antidote | 解毒药 | common | 移除当前中毒状态 | 是 |
| resurrection_cross | 重生十字架 | epic | 致命伤害时满血重生（安全帽优先） | 是 |
| bio_suit | 防护服 | rare | 沼泽毒气等特定事件中解锁[穿防护服]免疫选项（不免疫中毒状态本身） | 否 |

### 探索类（5 个）

| ID | 名称 | 品质 | 效果 | 消耗 |
|---|---|---|---|---|
| telescope | 望远镜 | uncommon | 永久视野 +2 | 否 |
| compass | 指南针 | common | 始终点亮传送门地块（无迷雾） | 否 |
| torch | 火把 | uncommon | 免疫冻伤 debuff + 寒冷伤害 + 浮冰地形伤害；过夜驱散野兽；遗迹/洞穴特殊选项 | 否 |
| magnet | 强力磁铁 | uncommon | 废墟/城镇获得金币量翻倍 | 否 |
| shovel | 铲子 | uncommon | 过夜事件：有 AP 且不在水面时可挖掘获得金币/素材 | 否 |

### 对话类（6 个）

| ID | 名称 | 品质 | 效果 | 消耗 |
|---|---|---|---|---|
| mask | 欺诈面具 | uncommon | 抢劫/盘问时解锁[伪装]，100% 避战 | 否 |
| stick | 逗猫棒 | common | 野兽[安抚]成功率 100% | 否 |
| fan | 芭蕉扇 | rare | 迷雾/毒气中解锁[扇走]选项 | 否 |
| earphone | 万能耳机 | uncommon | 小概率在正面选项后显示推荐标记🎧 | 否 |
| briefcase | 贿赂公文包 | uncommon | 守卫/强盗时解锁[给钱放行]（消耗金币） | 否 |
| hourglass | 沙漏 | rare | 对话选错致死/大额扣血时重新选择一次 | 是 |

### 战斗辅助类（8 个）

| ID | 名称 | 品质 | 效果 | 消耗 |
|---|---|---|---|---|
| sword | 剑 | uncommon | [威慑]毛贼获得金币 | 否 |
| whip | 鞭子 | rare | 不死族事件胜率超级大幅提高；免疫诅咒状态 | 否 |
| cowboy_hat | 牛仔帽 | uncommon | 战斗胜率+逃跑率提升，但遇毒蛇必中毒 | 否 |
| garlic | 大蒜 | common | 不死族增加胜率；概率解除诅咒（可能失败） | 是 |
| wolfsbane | 狼毒药剂 | uncommon | 狼人事件解锁[全身而退] | 是 |
| smoke_bomb | 烟雾弹 | uncommon | 逃跑 100% 成功 | 是 |
| hunting_dog | 猎犬 | rare | 大概率增加战斗胜率，但战后概率死亡 | 概率 |
| straw_doll | 草娃娃 | common | 很小概率吓跑敌人（boss 除外） | 否 |

### 被动/特殊类（9 个）

| ID | 名称 | 品质 | 效果 | 消耗 |
|---|---|---|---|---|
| strange_gem | 诡异宝石 | rare | "坏运气"选项概率降低 10% | 否 |
| thief_medal | 盗贼勋章 | uncommon | 战斗额外金币 +20%（按百分比）+免疫强盗，但城市过夜概率被抓 | 否 |
| sheriff_badge | 警长勋章 | uncommon | 强盗时解锁[逮捕]获大量金币；城市过夜加 HP+概率金币 | 否 |
| hoe | 锄头 | common | 荆棘/废墟挡路时解锁[清理] | 否 |
| water_cup | 无尽水杯 | common | 免疫干渴；祭坛奇遇；增强金盏花产出；食物餐车HP损失减半 | 否 |
| marigold | 金盏花 | common | 每回合休息后获得少量金币 | 否 |
| accordion | 手风琴 | uncommon | 过夜概率触发晚会+HP；有火把升级为篝火晚会+AP | 否 |
| old_scroll | 破旧的羊皮卷 | common | 单独无效果，与指南针组合成藏宝图 | 否 |
| sickle | 镰刀 | common | 在农田休息时 +20 HP | 否 |
| lava_core | 熔岩核心 | epic | 免疫所有火焰/熔岩伤害（岩浆垂钓获得） | 否 |
| salted_fish | 咸鱼 | common | 持有时NPC对话解锁嘲讽选项（纯搞笑） | 否 |
| empty_ball | 空的球 | uncommon | 概率收服弱小野兽获得临时战斗伙伴（增加下次战斗胜率） | 是 |

### 卖出/孵化类（3 个）

| ID | 名称 | 品质 | 效果 | 消耗 |
|---|---|---|---|---|
| pharaoh_scepter | 法老的权杖 | rare | 城市卖出获大量金币 + 免疫诅咒状态（卖掉失去诅咒免疫 vs 留着合成的三重抉择） | 卖出 |
| pearl | 珍珠 | uncommon | 城市卖出获金币（卖 vs 留着合成的抉择） | 卖出 |
| mystery_egg | 神秘蛋 | uncommon | 5 回合后孵化，三选一获得道具 | 是 |

### 组合道具（10 个）

| 材料 A | 材料 B | 结果 | ID | 品质 | 效果 |
|---|---|---|---|---|---|
| car | tent | 房车 | camper_van | legendary | 继承车+帐篷 + 增加回血 + 减少过夜遭遇战 |
| feather | parachute | 滑翔翼 | glider | legendary | 免疫摔伤 + 下坡 AP 消耗为 0 |
| shovel | telescope | 考古钻头 | drill | epic | 遗迹必得 rare+ 道具 |
| stick | torch | 巨型火炬 | mega_torch | uncommon | 视野 +3，2 格内寒冷伤害为 0 |
| sword | strange_gem | 大师之剑 | master_sword | legendary | 战斗成功率大幅提升，胜利不扣 HP |
| compass | old_scroll | 藏宝图 | treasure_map | rare | 点亮圣物碎片和传送门位置 |
| blue_sweater | water_cup | 万能药 | elixir | legendary | 回合结束移除所有负面状态 + 免疫干渴场地效果（继承自水杯） |
| mask | briefcase | 外交官礼包 | diplomat_kit | legendary | NPC 初始好感度"友善" |
| pharaoh_scepter | resurrection_cross | 法老法典 | pharaoh_codex | legendary | 战斗概率[劝降]获战利品（boss 除外） |
| pearl | boat | 黑珍珠号 | black_pearl | legendary | 进入水域 + 极大减少水上 AP 消耗 |

---

## 统计

| 类别 | 基础道具 | 组合道具 |
|---|---|---|
| 通行 | 5 | - |
| 移动 | 5 | - |
| 防御 | 5 | - |
| 生存 | 5 | - |
| 探索 | 5 | - |
| 对话 | 6 | - |
| 战斗辅助 | 8 | - |
| 被动/特殊 | 12 | - |
| 卖出/孵化 | 3 | - |
| 组合道具 | - | 10 |
| **总计** | **54** | **10** |
| **合计** | **64** | |

## 组合注意事项

- feather + parachute → glider：降落伞是消耗品，用掉就无法合成
- pharaoh_scepter + resurrection_cross → pharaoh_codex：牺牲保命道具换劝降能力
- pearl + boat → black_pearl：牺牲卖钱机会换水上优势
- blue_sweater + water_cup → elixir：合成后失去蓝色毛衣的减伤效果和水杯对金盏花的联动加成，但保留干渴免疫
- compass + old_scroll → treasure_map：两个弱道具合成强道具
