# Battle Array: Collapse — Arena 模式执行计划

## 1. 文档用途

本文档用于指导实现《Battle Array: Collapse》的第二个核心规则模式 `Arena`。

执行者应严格按阶段完成和验证，不要同时开展多个阶段。每完成一个阶段，先运行该阶段要求的检查并确认 Classic 没有回归，再进入下一阶段。

本计划的首个目标是完成一个可以稳定游玩的 Arena MVP，而不是一次加入大量新棋子。

---

## 2. 最终产品结构

游戏只保留两个核心规则模式：

### 2.1 Classic

Classic 就是当前《阵衡》的完整玩法，规则不得改变：

- 固定 7×7 棋盘。
- 双方各有固定的 10 枚棋。
- 双方使用完全相同的六种基础棋阵容。
- 没有地形。
- 没有随机事件。
- 双方轮流落子。
- 20 枚棋全部落完后统一进行 Collapse。
- Collapse 的攻击、支援、生存值、移除顺序和胜负规则全部保持不变。

### 2.2 Arena

Arena 使用同一套落子与 Collapse 核心规则，但开局流程不同：

```text
选择 Arena
    ↓
根据种子生成随机战场
    ↓
进行 10 轮相同候选的三选一 Draft
    ↓
双方各自得到 10 枚棋
    ↓
正常轮流布阵
    ↓
执行原有 Collapse
```

Arena 的随机性只发生在战场与 Draft 候选生成阶段。一旦正式进入布阵，游戏中不得出现随机命中、随机伤害、随机清算或其他不可预测结果。

---

## 3. MVP 范围

第一版 Arena 必须包含：

- 7×7 固定外框棋盘。
- 每局随机生成 3～6 个 Fence。
- 可复现的随机种子。
- 双方进行 10 轮三选一 Draft。
- 每轮双方看到完全相同的三个候选棋种。
- 双方允许选择同一个候选棋种。
- Draft 暂时只使用现有六种基础棋。
- Draft 完成后使用各自构筑的 10 枚棋进行正常布阵。
- 沿用现有攻击、支援、生存值、棋子关系查看和 Collapse 系统。
- 支持玩家对 AI。
- 支持本地双人。
- 中英文界面完整。
- 网页版与 Android 静态版本共用同一实现。

第一版明确不做：

- 不新增棋种。
- 不使用 8×8 或可变尺寸棋盘。
- 不增加第二种地形。
- 不增加联网对战。
- 不增加永久养成、解锁或货币。
- 不增加随机命中率、暴击或随机伤害。
- 不改变 Classic 的规则、棋盘或固定阵容。

---

## 4. 开始开发前的保护措施

当前项目可能存在尚未提交的清算复盘、Android 工程、棋子关系视角、默认语言和标题修改。执行前必须先保护这些工作。

### 任务

- [ ] 运行 `git status --short`，记录所有已修改和未跟踪文件。
- [ ] 不得使用 `git reset --hard`、`git checkout --` 或删除现有改动。
- [ ] 确认当前版本能够通过：
  - `npx eslint app/page.tsx app/layout.tsx tests/rendered-html.test.mjs`
  - `npm test`
  - `npm run build:static`
- [ ] 手动确认当前默认语言为英语。
- [ ] 手动确认当前默认棋子显示方式为图标。
- [ ] 手动确认英文标题为 `Battle Array: Collapse`。
- [ ] 手动确认棋子关系视角的“谁影响它 / 它影响谁”可以正常切换。

### 验收标准

- 当前状态被完整记录。
- 没有覆盖或丢失已有工作。
- 开始 Arena 开发前，现有构建与测试全部通过。

---

## 5. 阶段一：拆分游戏规则核心

### 目标

把规则计算从 `app/page.tsx` 中拆出，使 Classic 和 Arena 共用同一套规则函数。这个阶段只重构，不改变任何玩家可见行为。

### 建议目录

```text
lib/game/
├─ types.ts          # Player、Piece、PieceType、Phase、Terrain 等类型
├─ pieces.ts         # 棋子配置、数量、图标标识、能力数据
├─ board.ts          # 棋盘边界、格子键、占用和地形查询
├─ relations.ts      # 控制范围、攻击、支援、传入/传出关系
├─ collapse.ts       # 生存值、逐轮移除、胜负统计
├─ random.ts         # 带种子的确定性随机数
├─ classic.ts        # Classic 配置
└─ arena.ts       # Arena 配置、地图和 Draft 逻辑
```

可以根据现有项目结构调整文件名，但必须维持以下边界：

- React 组件不得负责计算棋子控制范围。
- React 组件不得负责执行 Collapse 算法。
- 地图生成器不得直接修改 React 状态。
- AI 与玩家必须调用相同的合法落子和规则函数。
- Classic 与 Arena 不得各复制一套攻击或 Collapse 逻辑。

### 必须抽出的纯函数

- [ ] 判断坐标是否在棋盘内。
- [ ] 生成格子唯一键。
- [ ] 计算一枚棋子的控制格。
- [ ] 计算一枚棋子受到的攻击者与支援者。
- [ ] 计算一枚棋子正在攻击和支援的目标。
- [ ] 计算所有棋子的攻击数、支援数与生存值。
- [ ] 计算双方控制格数。
- [ ] 执行完整 Collapse，并返回每一轮的快照。
- [ ] 判断一个格子是否允许落子。

### 测试要求

建议加入 Vitest，并增加 `test:rules` 脚本。若不加入 Vitest，也必须采用能够直接测试纯规则函数的等价方案，不能只检查源代码字符串。

至少覆盖：

- [ ] 六种基础棋的控制范围。
- [ ] 棋盘边缘裁剪。
- [ ] 炮台隔子与终止规则。
- [ ] 攻击和支援的阵营分类。
- [ ] “谁影响它”和“它影响谁”的方向正确。
- [ ] 生存值计算。
- [ ] 最低负生存值优先移除。
- [ ] 并列棋子同时移除。
- [ ] 移除后重新计算关系。
- [ ] 最终胜负与控制格决胜。

### 验收标准

- Classic 的画面和行为与重构前一致。
- 原有测试继续通过。
- 新增规则单元测试全部通过。
- `app/page.tsx` 主要负责状态协调和界面，不再包含整套规则算法。

---

## 6. 阶段二：区分规则模式与对战方式

### 目标

避免当前 `mode` 同时承担不同概念。规则模式与对战方式必须成为两个独立维度。

### 数据结构

```ts
type Ruleset = "classic" | "arena";
type OpponentMode = "ai" | "local";
```

如果当前 `mode` 表示 AI 或本地双人，应将其明确重命名为 `opponentMode`。不要使用同一个变量同时表示 Classic/Arena 和 AI/本地双人。

### 开局界面

只显示两个主要规则模式入口：

- `Classic`
- `Arena`

中英文说明：

```text
Classic
Same armies. Same battlefield. Pure formation strategy.
相同军队，相同战场，纯粹比较布阵。

Arena
Draft your army for a different battlefield every match.
面对每局不同的战场，临场构筑你的军队。
```

AI / 本地双人继续作为设置项或模式入口后的次级选择，不要扩展成四个并列的大模式按钮。

### 状态流程

建议明确以下阶段：

```ts
type GamePhase =
  | "mode-select"
  | "draft"
  | "placement"
  | "ready"
  | "settling"
  | "finished";
```

Classic 流程：

```text
mode-select → placement → ready → settling → finished
```

Arena 流程：

```text
mode-select → draft → placement → ready → settling → finished
```

### 验收标准

- Classic 和 Arena 只有两个主要入口。
- AI / 本地双人没有与规则模式混为一谈。
- 选择 Classic 后直接进入现有布阵。
- 选择 Arena 后进入地图与 Draft 流程。
- 重新开始时返回当前模式的新对局；另提供返回模式选择的入口。

---

## 7. 阶段三：确定性随机种子

### 目标

同一个种子必须生成完全相同的 Fence 布局和十轮 Draft 候选。

### 数据结构

```ts
type MatchSeed = string;

type SeededRandom = {
  next(): number;
  integer(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
};
```

### 规则

- [ ] 新建 Arena 对局时生成一个短且可复制的种子。
- [ ] 地图与 Draft 使用同一个根种子派生不同随机序列，避免修改地图算法后无意改变全部 Draft。
- [ ] 建议派生名称：`<seed>:battlefield` 与 `<seed>:draft`。
- [ ] 页面显示当前种子。
- [ ] 提供复制种子的按钮。
- [ ] 提供输入种子重新开始的入口。
- [ ] 不使用 `Math.random()` 直接决定 Arena 地图或候选。

### 测试要求

- [ ] 相同种子生成相同地图。
- [ ] 相同种子生成相同十轮候选。
- [ ] 不同种子能够生成不同结果。
- [ ] 地图生成与 Draft 生成互不消耗对方的随机序列。

### 验收标准

- 刷新后使用相同种子，可以复现同一局的开局题目。
- 测试失败时可以通过种子稳定复现。

---

## 8. 阶段四：生成 Arena 战场

### 目标

在 7×7 棋盘上生成 3～6 个 Fence，并保证地图可读、可落子且没有明显的异常结构。

### 数据结构

```ts
type TerrainType = "fence";

type TerrainCell = {
  row: number;
  col: number;
  type: TerrainType;
};

type BoardDefinition = {
  rows: 7;
  cols: 7;
  terrain: TerrainCell[];
};
```

Classic 使用同一 `BoardDefinition`，但 `terrain` 永远为空数组。

### Fence 最终规则

- Fence 格不能落子。
- Fence 不是棋子。
- Fence 不属于任何阵营。
- Fence 不提供攻击或支援。
- Fence 没有生存值，不参与 Collapse。
- Fence 不计入双方控制格数。
- 直线射线遇到 Fence 立即终止，不能穿过 Fence。
- Fence 不得被炮台当成启动射线的“隔子”。
- 骑士等跳跃能力可以越过 Fence，但不能把 Fence 格作为目标。
- 相邻型棋子不会控制 Fence 格。
- 现有射手“正好两格”的能力按定点能力处理：中间的 Fence 不阻断它，但目标格若为 Fence，则该格无效。

### 地图生成约束

- [ ] Fence 数量在 3～6 之间。
- [ ] 46～43 个格子可落子，足够容纳 20 枚棋。
- [ ] 所有可落子格必须属于同一个正交连通区域。
- [ ] 不生成完全被 Fence 包围的孤立空格。
- [ ] 每一行和每一列至少保留 4 个可落子格。
- [ ] 不允许四个角全部被 Fence 占据。
- [ ] 同一张地图中不要出现超过 3 个连续 Fence 形成的整段封锁。
- [ ] 地图不要求镜像对称。
- [ ] 若随机结果不满足约束，应使用同一随机序列继续重试，而不是回退到 `Math.random()`。

### UI 要求

- [ ] Fence 与红蓝棋子视觉上明显不同。
- [ ] Fence 不使用阵营颜色。
- [ ] Fence 应具有明确的“不可落子、阻断线路”外观。
- [ ] 鼠标悬停和手机点击 Fence 时不得出现落子预览。
- [ ] 点击 Fence 不进入棋子关系查看模式。
- [ ] 规则书增加 Fence 的双语说明。

### 测试要求

- [ ] 批量生成至少 1,000 个种子，所有地图都满足约束。
- [ ] 验证 Fence 阻断炮台射线。
- [ ] 验证 Fence 不充当炮台隔子。
- [ ] 验证骑士可以越过 Fence。
- [ ] 验证射手的定点能力不受中间 Fence 影响。
- [ ] 验证任何棋子都不能落在 Fence 上。

### 验收标准

- Classic 棋盘完全没有 Fence。
- Arena 每局能稳定生成合法且可复现的战场。
- Fence 规则在界面、AI 和 Collapse 中一致。

---

## 9. 阶段五：实现十轮三选一 Draft

### 目标

双方在同一战场、同一候选条件下，各自构筑十枚棋的阵容。

### 数据结构

```ts
type DraftOffer = [PieceType, PieceType, PieceType];

type DraftState = {
  round: number;                 // 0～9
  offers: DraftOffer[];          // 预先由种子生成十轮
  redRoster: PieceType[];
  blueRoster: PieceType[];
  redChoice: PieceType | null;
  blueChoice: PieceType | null;
};
```

### 候选生成规则

MVP 只使用六种基础棋：

```text
scout
guard
archer
cannon
knight
fortress
```

每轮：

- [ ] 生成三个互不重复的棋种。
- [ ] 双方看到完全相同的三个棋种。
- [ ] 双方都可以选择同一个棋种。
- [ ] 一个候选不会因为一方选择而被另一方移除。
- [ ] 连续两轮不得出现完全相同的三个候选组合。
- [ ] 每轮至少包含 `guard`、`scout`、`fortress` 中的一种基础阵型棋。
- [ ] 十轮候选在对局开始时由种子一次性生成，不能根据玩家选择临时改变。

### 玩家对 AI

- AI 必须在展示本轮候选时就根据地图、候选和自己已有阵容确定选择。
- AI 的选择先保存在内部，不立即展示。
- 玩家完成选择后，同时公开双方选择。
- AI 不得读取玩家本轮已经点击的结果再决定自己的选择。
- 公开结果后进入下一轮。

### 本地双人

采用遮挡式选择：

1. 显示本轮三个候选与当前玩家提示。
2. 玩家一选择。
3. 立即遮挡玩家一的选择。
4. 显示“交给另一位玩家”确认页。
5. 玩家二选择。
6. 同时公开双方选择。
7. 进入下一轮。

不得让玩家二直接看到玩家一已经选择的棋种。

### Draft UI

每个候选卡至少显示：

- 图标。
- 棋名。
- 简短范围图。
- 一句话能力说明。
- 当前己方阵容中已有数量。

同时显示：

- 当前轮次，例如 `Draft 4/10`。
- 当前战场缩略图或可随时查看战场的按钮。
- 红方与蓝方已经公开获得的棋子。
- 当前种子。

陌生棋种未来也必须通过同一候选卡结构解释，不另做大量首次弹窗。

### Draft 结束

- 红方阵容长度必须为 10。
- 蓝方阵容长度必须为 10。
- 将两个阵容转换为动态库存。
- 清空本轮临时选择。
- 进入原有 `placement` 阶段。

### 测试要求

- [ ] 每轮恰好三个不同候选。
- [ ] 双方收到相同候选。
- [ ] 双方可以选择相同棋种。
- [ ] 每方最终恰好十枚棋。
- [ ] 相同种子生成相同十轮候选。
- [ ] AI 选择在玩家选择前确定。
- [ ] 本地双人的第一位选择不会泄露给第二位。
- [ ] Draft 完成后库存数量与选择结果完全一致。

### 验收标准

- Draft 十轮流程没有跳轮、重复计入或少棋。
- 双方阵容可以不同。
- Draft 之后能够无缝进入布阵。

---

## 10. 阶段六：让布阵系统支持动态阵容

### 目标

移除“双方库存必然来自固定配置”的假设，但保持 Classic 的固定库存不变。

### 任务

- [ ] 将库存初始化改为读取当前对局的 `redRoster` 与 `blueRoster`。
- [ ] Classic 仍从固定阵容配置生成双方库存。
- [ ] Arena 从 Draft 结果生成双方库存。
- [ ] 手牌中数量为 0 的棋种可以隐藏，或保留禁用状态；移动端优先隐藏以节省空间。
- [ ] 手牌默认不选择任何棋子。
- [ ] 选择一枚手牌后，点击合法空格立即落子。
- [ ] 落子后清除选择。
- [ ] Fence 格不可点击落子。
- [ ] AI 只从自己的实际库存选择棋子。
- [ ] 撤回一步后正确恢复被撤回棋种的库存。
- [ ] AI 对战撤回仍应成对撤回玩家与 AI 的最近一步。
- [ ] 全部 20 枚棋落下后进入 `ready`，规则与 Classic 相同。

### 验收标准

- Classic 固定阵容完全不变。
- Arena 可以正确处理重复较多或完全不同的双方阵容。
- 不存在库存为负数、放置不存在棋种或提前开始 Collapse 的情况。

---

## 11. 阶段七：Arena AI

### 目标

让 AI 能够完成 Draft，并在带有 Fence 和动态阵容的棋盘上合法布阵。

### Draft AI MVP 评估因素

- 当前阵容中各棋种数量，避免十枚棋全部为同一种。
- 当前候选与已有棋子的互保潜力。
- Fence 密度与直线通道数量。
- 炮台可利用的隔子与射线路径。
- 骑士在障碍较多地图中的机动价值。
- 堡垒和近程棋在开放区与狭窄区的价值。
- 当前阵容是否缺少近程、远程或跳跃能力。

AI 不需要第一版就达到最优，但必须：

- [ ] 从三个候选中合法选择。
- [ ] 在玩家点击前锁定选择。
- [ ] 使用自己的真实 Draft 库存落子。
- [ ] 不在 Fence 或已有棋子上落子。
- [ ] 评估控制范围时正确处理 Fence。
- [ ] 在相同种子和固定 AI 风格下能够复现选择。

### 模拟测试

- [ ] 批量运行至少 500 局 Arena AI 自对弈。
- [ ] 不得出现崩溃、死循环、非法落子或库存错误。
- [ ] 记录红方胜率、蓝方胜率和平局率。
- [ ] 若先手胜率明显超过 60%，先记录并分析地图与 Draft 的影响，不要直接修改 Collapse 规则。
- [ ] 输出按地图种子可复现的问题样本。

### 验收标准

- AI 能完整经历地图、十轮 Draft、二十次布阵和 Collapse。
- 模拟中不存在规则错误。

---

## 12. 阶段八：界面与双语完整性

### 目标

让玩家始终知道自己处于哪个模式、哪个阶段，以及下一步需要做什么。

### 必须补充的双语内容

- Classic / Arena 的模式说明。
- Battlefield / 战场。
- Fence / 栅栏。
- Draft / 征募。
- Draft round / 征募轮次。
- Choose one / 选择一个。
- Your roster / 你的阵容。
- Opponent roster / 对手阵容。
- Reveal choices / 公布选择。
- Pass to the other player / 交给另一位玩家。
- Seed / 种子。
- Copy seed / 复制种子。
- Use seed / 使用种子。
- New battlefield / 新战场。
- Return to mode select / 返回模式选择。

具体中文词可以在实现时统一润色，但同一个概念不得在不同页面使用多个名称。

### UI 原则

- 英语继续作为默认语言。
- 图标继续作为默认棋子显示方式。
- 英文标题保持 `Battle Array: Collapse`。
- 中文模式标题保持 `阵衡`，除非用户另行决定。
- Classic 页面不得因为 Arena 增加大量永久按钮。
- 只有 Arena 才显示地图种子与 Draft 信息。
- 手机端 Draft 三张候选卡必须无需横向滚动即可阅读。
- Draft 时可以查看战场，但不能提前落子。
- 棋子关系视角继续支持“谁影响它 / 它影响谁”。
- 关系高亮继续使用阵营颜色，攻击/支援只用文字区分。

### 验收标准

- 中文和英文都不存在缺失键、混合语言或溢出文字。
- 手机宽度下模式选择、Draft、手牌和棋盘均可正常操作。
- Classic 的界面复杂度没有明显增加。

---

## 13. 阶段九：规则书与教学

### 目标

Classic 玩家只需学习原有六种棋；Arena 玩家在需要时再学习 Draft 与地形。

### 规则书结构

```text
通用规则
├─ 攻击与支援
├─ 生存值
└─ Collapse

Classic
├─ 固定棋盘
└─ 固定阵容

Arena
├─ 随机战场
├─ Fence
├─ 十轮 Draft
└─ 动态阵容
```

### 教学要求

- Classic 教学不得强迫玩家阅读 Arena 内容。
- Arena 首次进入时只解释三个新概念：随机战场、Fence、三选一 Draft。
- 不重复讲解已经在 Classic 中掌握的 Collapse。
- Draft 候选卡自身承担棋种说明职责。
- 首次提示应可关闭，并避免每次刷新重复强制出现。

### 验收标准

- 新玩家能理解为什么双方阵容不同。
- 玩家能理解 Fence 为什么不能落子、为什么会阻断射线。
- 玩家能理解落子开始后不再有随机事件。

---

## 14. 阶段十：回归测试矩阵

每次准备合并或发布前，至少完成以下组合：

| 规则模式 | 对战方式 | 语言 | 设备 | 必测内容 |
|---|---|---|---|---|
| Classic | AI | English | Desktop | 完整布阵、关系查看、Collapse、复盘 |
| Classic | AI | 中文 | Mobile | 手牌选择、单击落子、结果弹窗 |
| Classic | Local | English | Desktop | 双方轮流、撤回、结算 |
| Arena | AI | English | Desktop | 地图、Draft、动态库存、完整对局 |
| Arena | AI | 中文 | Mobile | Draft 卡片、Fence、单击落子、Collapse |
| Arena | Local | English | Mobile | 遮挡选择、交接、公开结果、完整对局 |

### 自动检查

- [ ] `npx eslint app/page.tsx app/layout.tsx tests/rendered-html.test.mjs`
- [ ] 规则单元测试。
- [ ] 地图生成属性测试。
- [ ] Draft 生成与库存测试。
- [ ] `npm test`。
- [ ] `npm run build:static`。
- [ ] `npm run android:sync`。

### 手动重点检查

- [ ] Classic 不出现 Fence 或 Draft。
- [ ] Classic 固定阵容数量完全一致。
- [ ] Arena 相同种子可复现。
- [ ] Fence 不可落子。
- [ ] Fence 对六种基础棋的影响符合规则。
- [ ] AI 不会在玩家选择后临时改变本轮 Draft 选择。
- [ ] 双方允许选择同一个候选。
- [ ] Draft 后双方库存等于各自十轮选择。
- [ ] 手机端没有横向溢出、遮挡或无法点击的按钮。
- [ ] 中英文切换不会重置当前对局。
- [ ] “谁影响它 / 它影响谁”在 Fence 地图中仍然正确。
- [ ] Collapse 复盘使用当时的地图和棋子快照。

---

## 15. 建议提交顺序

不要把整个 Arena 做成一次巨大提交。建议按以下边界拆分：

1. `refactor: extract shared game rules`
2. `test: cover piece relations and collapse`
3. `feat: add classic and arena rulesets`
4. `feat: add deterministic match seeds`
5. `feat: generate fenced arena battlefields`
6. `test: validate battlefield generation`
7. `feat: add ten-round shared-offer draft`
8. `feat: support dynamic drafted rosters`
9. `feat: add arena draft AI`
10. `feat: add local pass-and-play draft privacy`
11. `docs: add arena rules and bilingual copy`
12. `build: sync static and android outputs`

如果当前工作区尚未整理完成，执行者不得擅自提交或推送。每次提交前先向用户确认当前提交范围，避免把之前未完成的功能混进错误的提交中。

---

## 16. 完成定义

Arena MVP 只有同时满足以下条件才算完成：

- [ ] 游戏首页只有 Classic 和 Arena 两个核心规则入口。
- [ ] Classic 的规则和体验没有改变。
- [ ] Arena 地图可由种子稳定复现。
- [ ] 每局有 3～6 个合法 Fence。
- [ ] 双方完成十轮相同候选的三选一 Draft。
- [ ] 双方可以选择同一个棋种。
- [ ] 玩家对 AI 时，AI 在玩家选择前锁定选择。
- [ ] 本地双人选择过程不会泄露前一位玩家的选择。
- [ ] 双方各自使用 Draft 得到的十枚棋布阵。
- [ ] Fence 规则对玩家、AI、关系查看和 Collapse 完全一致。
- [ ] 布阵开始后没有任何随机战斗结果。
- [ ] 中英文完整。
- [ ] 桌面与手机均可完成整局。
- [ ] 网页构建、静态构建、Android 同步和全部测试通过。
- [ ] 至少 500 局自动模拟无崩溃、无非法状态。

---

## 17. Luna 的第一轮执行范围

第一轮只执行以下内容，不要立即实现完整 Arena：

1. 检查并保护当前未提交改动。
2. 将现有规则计算拆分为纯函数模块。
3. 为六种棋、攻击支援、关系方向和 Collapse 建立单元测试。
4. 将当前 AI/本地双人的 `mode` 概念与未来的 `Ruleset` 概念分开。
5. 增加 Classic/Arena 两个入口，但 Arena 暂时显示“开发中”或进入空的 Draft 骨架。
6. 确认 Classic 的玩家可见行为完全不变。
7. 运行所有检查并汇报：修改文件、测试结果、遗留风险和下一阶段建议。

第一轮验收通过后，第二轮再实现种子与 Fence；第三轮实现 Draft；第四轮实现 AI、双人隐私流程和完整移动端验收。

