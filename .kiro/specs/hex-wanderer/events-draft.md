# 事件系统规划草案

## 地图显示分类

事件在地图上用不同 icon 区分：
- ⚔️ 战斗事件（combat）
- 📦 宝箱/宝物事件（treasure）+ 道具拾取
- ❓ 选择/NPC事件（choice）

## UI 改进

- 选择"离开/放弃/绕路"等无收益选项时，不弹出事件结束对话框
- 只有实际产生了效果（获得/失去 HP/AP/金币/道具/debuff）时才显示结果对话框

## 事件地形分配表

每个事件限定可出现的地形类型，MapGenerator 放置事件时必须检查地形匹配。

### 战斗事件 (combat)

| 事件ID | 名称 | 可出现地形 |
|--------|------|-----------|
| wolf_attack | 狼群突袭 | 草地、森林 |
| swamp_creature | 沼泽怪物 | 沼泽 |
| snake_encounter | 毒蛇出没 | 草地、森林、沼泽 |
| undead_battle | 不死族袭击 | 任何陆地 |
| bandit_encounter | 强盗拦路 | 草地、荒漠、森林 |
| monster_camp_battle | 怪物营地 | 任何陆地 |
| sandstorm | 沙暴来袭 | 荒漠 |
| sea_storm | 海上风暴 | 水域 |
| lava_eruption | 熔岩喷发 | 熔岩 |
| blizzard | 暴风雪 | 浮冰 |
| relic_guardian | 圣物守护者 | 任何陆地（特殊放置） |

### 宝箱/宝物事件 (treasure)

| 事件ID | 名称 | 可出现地形 |
|--------|------|-----------|
| chest_01 | 神秘宝箱 | 任何地形 |
| chest_02 | 藏宝箱 | 任何地形 |
| herb_discovery | 草药发现 | 森林、沼泽 |
| floating_crate | 漂浮的木箱 | 水域 |

### 选择/NPC事件 (choice)

| 事件ID | 名称 | 可出现地形 |
|--------|------|-----------|
| ruin_explore | 古代遗迹 | 任何陆地 |
| cave_explore | 幽深洞穴 | 任何陆地 |
| mine_explore | 废弃矿坑 | 荒漠、草地 |
| stargazing | 星空观测 | 任何陆地 |
| forest_spirit | 森林精灵 | 森林 |
| will_o_wisp | 鬼火 | 沼泽、森林 |
| desert_merchant | 沙漠商人 | 荒漠 |
| wandering_healer | 流浪治疗师 | 任何陆地 |
| ancient_shrine | 古老神龛 | 任何陆地 |
| ice_crack | 冰面裂缝 | 浮冰 |
| poison_cave | 毒气洞窟 | 森林、沼泽 |
| city_market | 城镇集市 | （建筑事件，城市专属） |
| dig_event | 挖掘 | （过夜事件，非水域） |
| relic_shrine | 神秘祭坛 | 任何陆地（特殊放置） |
| relic_trial | 试炼之地 | 任何陆地（特殊放置） |

### 特殊触发事件（不在地图上放置）

| 事件ID | 触发条件 |
|--------|---------|
| tutorial | 出生点专属 |
| thief_city_arrest | 持有盗贼勋章在城市过夜 |
| sheriff_city_bonus | 持有警长勋章在城市过夜 |
| accordion_party | 持有手风琴过夜 |
| campfire_party | 持有手风琴+火把过夜 |
| mystery_egg_hatch | 持有神秘蛋5回合后 |
| fox_repayment | 救助狐狸后随机回合触发：70%报恩（道具/金币），30%恩将仇报（负面效果） |

## 待新增事件

### 水域新增
- sea_tentacle（触手怪物）：水域战斗事件，概率掉HP或AP

### 建筑事件（需要新增）
- lighthouse_event：灯塔点亮事件
- watchtower_event：瞭望塔登顶事件
- church_prayer：教堂祈祷事件
- camp_trade：营地交易事件
- city_trade：城市交易事件
- training_event：训练场选择事件
- altar_event：祭坛供奉事件
- wishing_well_event：许愿池投币事件
- phone_booth_event：电话亭拨号事件
- food_truck_event：食物餐车购买事件
- bonfire_event：篝火休息事件
- hollow_tree_event：树洞钻入事件
- colossus_hand_event：巨像之手攀爬/冥想事件
- vending_machine_event：自动贩卖机投币事件
- reef_combat：暗礁战斗事件
- reef_search：暗礁搜索事件
- reef_repair：暗礁修船事件



## 过夜事件系统

过夜事件在回合结束（休息）时触发，受地形、建筑、持有道具影响。

### 通用过夜事件（任何地形）

| 事件ID | 名称 | 效果 | 备注 |
|--------|------|------|------|
| overnight_insomnia | 失眠 | -1~2 AP（随机） | 未知原因，概率较低 |
| overnight_sick | 生病 | -1 AP, -5~10 HP | 高海拔/浮冰/水域概率更大，帐篷降低概率 |
| overnight_undead | 半夜不死族 | 战斗事件，可能附带诅咒 | 鞭子/大蒜有额外选项 |
| overnight_bandit | 半夜强盗 | 被打劫，损失金币或HP | 盗贼勋章免疫，警长勋章反击 |
| overnight_accordion | 即兴晚会 | 额外恢复HP | 需持有手风琴 |
| overnight_campfire | 篝火晚会 | 额外恢复HP+AP | 需持有手风琴+火把 |

### 地形专属过夜事件

| 事件ID | 名称 | 地形 | 效果 |
|--------|------|------|------|
| overnight_wolf | 狼群夜袭 | 草地、森林 | 战斗，火把可驱赶 |
| overnight_stargazing | 星空观测 | 草地、荒漠 | 概率获得视野buff / 小概率失眠-AP / 极小概率获知圣物碎片位置 |
| overnight_sandstorm | 夜间沙暴 | 荒漠 | 帐篷可抵挡，否则掉HP |
| overnight_merchant | 夜间商人 | 荒漠、草地 | 金币交易买道具，有概率遇到黑心商人（付钱后什么都没有） |
| overnight_swamp_gas | 半夜毒气 | 沼泽 | 概率中毒，防护服免疫 |
| overnight_sea_storm | 夜间风暴 | 水域 | 掉HP或AP |
| overnight_spirit_song | 精灵之歌 | 森林 | 概率恢复HP，小概率获得道具 |
| overnight_siren_song | 女妖之歌 | 水域 | 概率迷惑（-AP），小概率获得珍珠 |
| overnight_blizzard | 夜间暴风雪 | 浮冰 | 概率冻伤，帐篷/火把可抵挡 |
| overnight_lava_tremor | 熔岩震动 | 熔岩 | 概率掉HP |

### 建筑专属过夜事件

| 事件ID | 名称 | 建筑 | 效果 |
|--------|------|------|------|
| overnight_city_rest | 城市安睡 | 城市 | 额外恢复HP，警长勋章概率获得金币 |
| overnight_city_thief | 城市被抓 | 城市 | 持有盗贼勋章时概率触发，损失金币+HP |
| overnight_camp_trade | 营地交易 | 营地 | 概率触发，金币换道具 |
| overnight_farm_harvest | 农田收获 | 农田 | 持有镰刀时+20HP |

### 道具触发过夜事件

| 事件ID | 触发条件 | 效果 |
|--------|---------|------|
| overnight_accordion | 持有手风琴 | 概率触发晚会，额外恢复HP |
| overnight_campfire | 持有手风琴+火把 | 概率触发篝火晚会，恢复HP+AP |
| overnight_dig | 持有铲子（非水域） | 概率触发挖掘，获得金币3-8g或道具 |
| overnight_egg_progress | 持有神秘蛋 | 孵化进度+1（5回合后孵化） |

## 已确认

1. 事件密度提高到30%+
2. 地图上暂时保留❓标识用于测试，正式版不显示事件标识
3. 事件地形限制：每个事件只能出现在对应地形上
4. 无收益选择不弹结束对话框
5. 宝箱为通用事件（任何地形）
6. 水域新增触手怪物战斗事件
7. 森林新增巨石挡路
8. 过夜事件受地形+建筑+道具三重影响


## 新增地图事件

### 森林专属

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| forest_beehive | 蜂巢 | choice | [驱散]需火把安全通过；[硬掏]掉HP直接获得2-3 AP（蜂蜜，不是道具） |
| forest_old_deer | 老鹿 | choice | [跟随]揭开周围地图迷雾；[狩猎]得肉（回HP）但概率获得诅咒 |
| forest_mushroom | 蘑菇圈 | choice | [吃蘑菇]随机效果（回HP/中毒/视野buff/幻觉-AP） |
| forest_lost | 迷路 | choice | 消耗额外1-2 AP，指南针可免疫 |
| forest_hunter_cabin | 猎人小屋 | choice | [交易]金币换道具；[休息]回HP |

### 荒漠专属

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| desert_mirage | 海市蜃楼 | choice | 假的绿洲，走近后消失，-1 AP；望远镜可识破 |
| desert_quicksand | 流沙 | combat | 陷入流沙，-HP/-AP；钩爪可自救 |
| desert_temple | 沙漠神殿 | choice | 探索获得道具/金币，有陷阱风险 |
| desert_bones | 干枯骨骸 | choice | [搜身]得金币；[埋葬]-1 AP但清除一个debuff |
| desert_cactus | 仙人掌 | choice | [切开]持有刀类道具回AP；[撞击]滑稽扣HP |

### 水域专属

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| sea_tentacle | 触手怪物 | combat | 战斗掉HP；船可加速逃离 |
| sea_whirlpool | 漩涡 | choice | 被传送到随机水域地块 |
| sea_shipwreck | 沉船 | treasure | 搜索获得道具/金币，概率遇到怪物 |
| sea_bottle | 漂流瓶 | treasure | [开启]随机消耗品或冷笑话，极小概率获得藏宝图 |
| sea_mermaid | 美人鱼 | choice | [歌唱]回满AP；[交易]交出身上最贵道具换高品质物品（需持有epic+道具才出现此选项） |

### 沼泽专属

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| swamp_rotten_tree | 腐烂古树 | choice | [砍伐]得木棍；[祭拜]清除中毒 |
| swamp_gas_bubble | 毒气泡 | choice | [戳破]概率中毒；[点火]持有火把引发爆炸（大额扣HP但炸出宝箱） |
| swamp_witch | 沼泽巫婆 | choice | [交易]金币换道具/解除debuff；[拒绝]概率被诅咒 |
| swamp_fog | 沼泽迷雾 | choice | 迷路-1~2 AP，指南针可免疫 |

### 浮冰专属

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| ice_frozen_chest | 冰封宝箱 | treasure | 需火把解冻才能打开，否则只能放弃 |
| ice_snowman | 雪人 | choice | 随机友好（给道具）或敌对（战斗） |
| ice_frozen_fish | 冰封的鱼 | choice | [加热]需火把，得熟鱼（消耗品回HP）；[凿冰]-1 AP |
| ice_penguin | 企鹅群 | choice | [滑行]沿当前朝向方向不受控制滑行3格（不消耗AP）；[打扰]被群殴扣HP |

### 熔岩专属

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| lava_obsidian | 黑曜石碑 | choice | [触摸]高温扣HP，但永久+1视野 |
| lava_fishing | 岩浆垂钓 | choice | 需防火靴，概率钓起"熔岩核心"（Epic道具） |
| lava_fire_spirit | 火焰精灵 | choice | [交易]金币换火系道具；[战斗]掉HP但概率得稀有道具 |

### 通用新增（任何陆地）

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| roadblock | 路障/巨石 | choice | [推开]-AP；[炸开]需炸弹（概率受伤但炸出金币）；[用锄头清理]需锄头；[绕路]-更多AP |
| wandering_trader | 流浪商人 | choice | 3选1道具交易，偶尔卖"假货"（付钱后得到无用物品） |
| wild_boar | 路边野猪 | choice | [狩猎]概率回HP概率受伤；[无视]概率被顶一下掉HP |
| mysterious_stele | 神秘石碑 | choice | 解谜获得buff（视野/AP/HP），失败无惩罚 |
| traveler_exchange | 旅行者 | choice | 交换道具（随机提出用你的某道具换另一个） |
| mountain_fox | 受伤的狐狸 | choice | 高海拔地区出现。[救助]-少量HP/AP；随机回合后触发报恩事件：70%概率获得道具/金币，30%概率恩将仇报获得负面效果。[无视]无事 |


## 新增地图事件（第二批，目标100+）

### 通用新增（任何陆地）

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| thunderstorm | 雷暴雨 | combat | 持有金属道具（剑/锁子甲/安全帽等）概率被雷劈-大量HP；无金属道具只是淋雨-少量HP |
| rockfall | 落石 | combat | 概率掉HP，安全帽可保护 |
| lost_child | 迷路的孩子 | choice | [帮助]-AP但获得金币/道具；[无视]无事 |
| injured_traveler | 受伤的旅人 | choice | [治疗]消耗解毒药/HP获得金币；[抢劫]获得金币但概率被反杀 |
| abandoned_camp | 废弃营地 | treasure | 搜索获得道具/金币，概率触发陷阱 |
| ancient_chess | 古老的棋盘 | choice | [下棋]智力挑战，赢了获得道具/金币，输了-AP |
| mysterious_door | 神秘的门 | choice | 需要特定道具（钥匙/炸弹/锄头）才能打开，里面有好东西 |
| collapsed_bridge | 倒塌的桥 | choice | [修复]-AP；[跳过去]概率摔伤；[绕路]-更多AP |
| wildflower_field | 野花田 | choice | 采集获得少量HP恢复 |
| bird_nest | 鸟巢 | choice | [爬上去]概率获得羽毛/蛋，概率摔伤；[离开]无事 |
| meteor_shower | 流星雨 | choice | 概率获得诡异宝石，概率被砸-HP |
| earthquake | 地震 | combat | 概率掉HP，概率发现地下通道（传送到随机位置） |
| magic_circle | 奇怪的魔法阵 | choice | [触碰]全地图随机传送；[离开]无事 |

### 森林新增

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| spider_web | 蜘蛛网 | choice | 被困-1~2 AP，剑/火把可切断免受影响 |
| tree_spirit | 树精 | choice | [对话]获得HP/视野buff；[砍伐]获得木棍但被诅咒 |
| hidden_spring | 隐藏的泉水 | choice | 恢复HP+AP（比较稀有的好事件） |

### 荒漠新增

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| scorpion | 蝎子 | combat | 概率中毒，靴子类道具降低中毒概率 |
| sand_worm | 沙虫 | combat | 大型战斗，概率掉大量HP但奖励丰厚（金币+稀有道具） |

### 水域新增

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| pirate_ship | 海盗船 | combat | [战斗]概率获得大量金币；[交易]金币换道具；[逃跑]-AP |
| dolphin | 海豚 | choice | [跟随]免费移动2-3格水域；[无视]无事 |

### 浮冰新增

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| aurora | 极光 | choice | 概率获得视野buff或HP恢复，纯正面事件 |
| ice_hole | 冰洞 | choice | [跳入]传送到随机位置；[离开]无事 |


## 新增地图事件（第三批——经典致敬与彩蛋）

### 经典游戏致敬

| 事件ID | 名称 | 类型 | 致敬 | 描述 |
|--------|------|------|------|------|
| hay_stack | 草堆/干草垛 | choice | 刺客信条 | [信仰之跃]-5 HP，向前移动3格（类似企鹅滑行） |
| cardboard_box | 纸箱子 | choice | 合金装备 | [躲入]遇到巡逻/强盗事件时100%避战 |
| pokeball | 红白相间的球 | choice | 宝可梦 | [拾取]获得"空的球"，概率收服弱小野兽（获得临时战斗伙伴） |
| praise_sun | 赞美太阳的雕像 | choice | 黑暗之魂 | [姿势]恢复所有AP并解除诅咒 |
| red_blue_pill | 红蓝药丸 | choice | 黑客帝国 | [蓝色]"回到你原本的生活"，强制结束游戏并保存；[红色]什么都没有发生（极小概率触发） |
| green_pipe | 路边的水管 | choice | 超级马里奥 | [钻入]-1 AP，传送到最近的城市或营地 |

### 探索/冒险类

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| ancient_battlefield | 古战场遗迹 | choice | [清理]-30 HP，获得一件稀有装备（高代价高回报） |
| unburnt_letter | 未烧完的信件 | treasure | [阅读]揭示一个圣物碎片的具体坐标 |

### 现代/搞笑彩蛋

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| power_outlet | 路边的插座 | choice | [插入]持有磁铁→AP补满；否则被电击-20 HP |
| coffee_machine | 程序员的咖啡机 | choice | [启动]接下来3回合AP消耗大幅减少，但之后极度疲劳（-AP，HP上限临时减少） |
| wifi_router | 信号满格的路由器 | choice | [连接]揭开周围5格迷雾，但"网速过快"直接跳到下一回合 |
| red_button | 禁止触摸的按钮 | choice | [按下]完全随机：可能得道具/金币/debuff/失去或回复HP/AP |
| salted_fish | 路边的咸鱼 | treasure | [捡起]获得"咸鱼"道具，持有时NPC对话解锁嘲讽选项 |
| mirror | 路边的镜子 | choice | [照镜子]状态全满时获得"自信"buff（当回合有效，不过夜），下次事件无负收益 |


## 新增地图事件（第四批——更多彩蛋与特殊事件）

### 更多致敬/Meta彩蛋

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| nonexist_door | 不存在的404门 | choice | [进入]"资源加载失败"，传送回本局游戏起点（重生点） |
| old_tv | 破旧的电视机 | choice | [伸手进入]-10 HP，随机获得Rare道具（致敬女神异闻录4） |
| rubber_duck | 巨大的黄色鸭子 | choice | [捏一下]巨大响声，概率吸引怪物战斗，也可能吸引小精灵获得收益 |

### 探索/冒险类

| 事件ID | 名称 | 类型 | 描述 |
|--------|------|------|------|
| nameless_grave | 无名者的墓碑 | choice | [献花]-1 AP解除所有诅咒；[挖掘]获得金币但永久-5 HP上限 |
| dry_well | 干枯的井底 | choice | [跳下]50%跌落-20 HP，50%发现隐藏密室获得Epic道具 |
| silent_monk | 沉默的修道士 | choice | [静坐]消耗所有AP，本回合结束后回复50% HP |
| rainbow | 彩虹 | choice | [到达终点]-AP，概率获得金币，概率彩虹消失什么都没有 |
| solar_eclipse | 日食 | choice | 下一回合视野范围变为1，但所有祭坛献祭收益翻倍 |

### 新增战斗怪物（丰富战斗类型）

| 事件ID | 名称 | 类型 | 地形 | 描述 |
|--------|------|------|------|------|
| goblin_ambush | 哥布林伏击 | combat | 草地、森林 | 弱小但数量多，概率偷走金币；逃跑容易 |
| skeleton_knight | 骷髅骑士 | combat | 任何陆地 | 不死族精英，高伤害但概率掉稀有道具；鞭子/大蒜有效 |
| giant_spider | 巨型蜘蛛 | combat | 森林、沼泽 | 概率中毒，火把可驱赶；击败后获得金币 |
| ice_golem | 冰霜巨人 | combat | 浮冰 | 高HP高伤害，火把有效；击败后获得金币 |
| fire_drake | 火蜥蜴 | combat | 熔岩 | 喷火攻击，防火靴减伤；击败后获得金币 |
| sea_serpent | 海蛇 | combat | 水域 | 概率中毒，船可加速逃离 |
| sand_scorpion | 沙漠蝎王 | combat | 荒漠 | Boss级，高伤害+中毒，击败后大量金币+稀有道具 |
| vampire | 吸血鬼 | combat | 任何陆地（夜间/洞穴） | 吸血攻击（你掉HP它回HP），大蒜/鞭子有效；概率诅咒 |
| werewolf | 狼人 | combat | 草地、森林 | 高伤害，狼毒药剂可全身而退；牛仔帽增加胜率 |
| mimic | 宝箱怪 | combat | 任何地形 | 伪装成宝箱，打开后变成怪物；击败后获得好道具 |
| banshee | 女妖 | combat | 沼泽、森林 | 尖叫攻击-AP，概率诅咒；万能耳机可抵抗 |
| troll | 巨魔 | combat | 森林、荒漠 | 高HP，火把可造成额外伤害；击败后概率获得金币 |
| phantom | 幽灵 | combat | 任何陆地 | 物理攻击无效（剑无用），需要火把/诡异宝石；概率掉道具 |
| rock_elemental | 岩石元素 | combat | 荒漠、熔岩 | 高防御，炸弹可一击破防；击败后获得金币 |
| swamp_hydra | 沼泽九头蛇 | combat | 沼泽 | Boss级，多次攻击，概率中毒+流血；击败后大量奖励 |


## 新增战斗怪物（第二批——补充到50种）

### 草地/森林怪物

| 事件ID | 名称 | 类型 | 地形 | 描述 |
|--------|------|------|------|------|
| wild_bear | 野熊 | combat | 草地、森林 | 高HP，逃跑困难；火把可驱赶；击败后获得金币 |
| forest_bandit_chief | 山贼头目 | combat | 森林 | Boss级强盗，高伤害+偷金币；警长勋章有效；击败后大量金币 |
| treant | 树人 | combat | 森林 | 高防御，火把造成额外伤害；击败后获得金币 |
| hornet_swarm | 黄蜂群 | combat | 草地、森林 | 多次小伤害，烟雾弹可驱散；概率中毒 |
| wild_cat | 野猫 | combat | 草地、森林 | 弱小但敏捷，逗猫棒100%安抚；击败后无奖励（纯搞笑） |
| centaur | 半人马 | combat | 草地 | 高速攻击，逃跑困难；[对话]选项概率和平解决 |

### 荒漠怪物

| 事件ID | 名称 | 类型 | 地形 | 描述 |
|--------|------|------|------|------|
| mummy | 木乃伊 | combat | 荒漠 | 不死族，概率诅咒；鞭子/大蒜有效；击败后获得金币 |
| sand_golem | 沙之巨人 | combat | 荒漠 | 高HP高防御，水杯可削弱；击败后获得金币 |
| desert_raider | 沙漠掠夺者 | combat | 荒漠 | 骑骆驼的强盗，偷金币；面具可伪装 |
| dust_devil | 尘暴恶魔 | combat | 荒漠 | 旋风攻击-AP，帐篷可抵挡 |
| basilisk | 蛇蜥 | combat | 荒漠 | 石化凝视（概率-2 AP），盾牌可反射 |

### 水域怪物

| 事件ID | 名称 | 类型 | 地形 | 描述 |
|--------|------|------|------|------|
| kraken | 海怪 | combat | 水域 | Boss级，触手攻击多段伤害；击败后大量金币+稀有道具 |
| ghost_ship | 幽灵船 | combat | 水域 | 不死族船员，概率诅咒；鞭子有效；击败后获得金币+揭雾 |
| shark | 鲨鱼 | combat | 水域 | 高伤害单次攻击；船可加速逃离 |
| water_elemental | 水元素 | combat | 水域 | 中等难度，击败后获得金币 |

### 沼泽怪物

| 事件ID | 名称 | 类型 | 地形 | 描述 |
|--------|------|------|------|------|
| bog_witch | 沼泽女巫 | combat | 沼泽 | 魔法攻击+概率诅咒；大蒜有效；击败后获得金币 |
| leech_swarm | 水蛭群 | combat | 沼泽 | 持续吸血（流血debuff）；火把可驱赶 |
| mud_golem | 泥巨人 | combat | 沼泽 | 高HP低伤害，击败后概率获得泥中宝物 |
| poison_frog | 毒蛙 | combat | 沼泽 | 弱小但必定中毒；解毒药可预防 |

### 浮冰怪物

| 事件ID | 名称 | 类型 | 地形 | 描述 |
|--------|------|------|------|------|
| frost_wolf | 冰霜狼 | combat | 浮冰 | 冻伤攻击，火把有效；击败后获得金币 |
| yeti | 雪人怪 | combat | 浮冰 | Boss级，高HP高伤害；击败后获得大量金币+稀有道具 |
| ice_wraith | 冰魂 | combat | 浮冰 | 幽灵类，物理攻击减效；火把造成额外伤害 |

### 熔岩怪物

| 事件ID | 名称 | 类型 | 地形 | 描述 |
|--------|------|------|------|------|
| lava_worm | 熔岩虫 | combat | 熔岩 | 从地下突袭，防火靴减伤；击败后获得金币 |
| fire_elemental | 火元素 | combat | 熔岩 | 高伤害，水杯可削弱；击败后获得金币 |
| magma_titan | 岩浆巨人 | combat | 熔岩 | Boss级，极高伤害；防火靴+盾牌组合可大幅减伤 |

### 通用怪物（任何陆地）

| 事件ID | 名称 | 类型 | 地形 | 描述 |
|--------|------|------|------|------|
| dark_knight | 黑暗骑士 | combat | 任何陆地 | 精英怪，高伤害高防御；剑可增加胜率；击败后稀有道具 |
| slime | 史莱姆 | combat | 任何陆地 | 弱小，必定击败；概率获得少量金币或消耗品 |
| doppelganger | 分身 | combat | 任何陆地 | 复制你的属性，难度取决于你的状态；击败后获得诡异宝石碎片 |


## 已确认（补充）

9. 咖啡机"极度疲劳"debuff：持续>3回合，具体时长随机
10. 纸箱子"躲入"：本回合buff，当回合内遇到巡逻/强盗自动避战
11. 宝箱怪(mimic)地图上显示📦（伪装成宝箱）
12. 日食效果只持续1回合
13. 彩蛋事件（红蓝药丸、赞美太阳等）出现概率<1%，非常稀有
14. Boss级怪物放置规则：
    - 圣物碎片守护者：必定是Boss
    - 怪物营地：大概率是Boss
    - 其他Boss（蝎王、九头蛇、海怪、雪人怪、岩浆巨人、山贼头目）：按地图大小1-2个
15. 自信buff：当回合有效，不过夜
16. 战斗掉落物统一为金币/已有道具，不新增战利品道具
