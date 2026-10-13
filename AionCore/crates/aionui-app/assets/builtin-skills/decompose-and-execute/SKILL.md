---
name: decompose-and-execute
description: Execute complex/large multi-step tasks reliably via a 4-step loop — decompose plan→module→task→subtask to a quantified fineness, parallelize ONLY independent subtasks (serialize dependent ones, never parallelize same-file mutations), re-plan after each module, verify before marking done. Use for complex implementations, large features, multi-file changes, migrations, refactors, or any task big enough to need real decomposition. Trigger keywords (复杂任务, 大型任务, 多步骤, 拆解, 拆成模块, 拆成小任务, 分解, 并行执行, 最多并行). Do NOT use for single-file tweaks, obvious 1-3 step fixes, read-only research/exploration (use Explore instead), or time-based recurring polling (use /loop instead).
version: 1.0
---

# 分解-执行-重估（复杂任务执行流程）

复杂/大型任务的可靠执行框架。Claude 默认会拆任务、会用 Agent，但经常**拆得不够细、错误地过度并行、埋头干不回头、过早宣布完成**。本 skill 把这四件固化为可执行步骤。

核心循环：**分解 → 执行 → 重估 → 验证**，逐模块推进直到全清单完成。

**前置边界**：本 skill 管"已定方案怎么拆着干"。若任务还卡在架构决策层（微服务 vs 单体、选什么库 / 数据库、系统怎么分层），先用 `Plan` agent（架构规划专用）出架构决策，再用本 skill 分解执行。

---

## 1. 分解（Decompose）

把任务拆成 `plan → module → task → subtask`，**直到叶子任务满足"够细"标准**。

**"够细"硬标准**（叶子任务必须同时满足）：
- 单次专注 pass 能完成
- 预计 ≤ ~8–12 次工具调用
- 有一个明确的、可验证的交付物（一个函数 / 一个文件 / 一组测试通过 / 一个可观察行为）

不满足就**继续往下拆**——禁止带着"先做着看"的大任务进入执行。拆得不够细是后续返工的头号原因。

落盘：用 `TodoWrite` 把分解结果写成清单。模块作为逻辑分组，叶子任务作为待勾选项。先拆完再动手，不要边拆边做。

---

## 2. 执行（Execute）—— 并行纪律

对当前一批叶子任务，先判断依赖关系，再决定并行还是串行：

| 关系 | 做法 |
|---|---|
| **独立**（无数据/文件依赖） | 并行：单条消息里发**多个 Agent 工具调用** |
| **有依赖**（A 的输出是 B 的输入） | 串行：等 A 完成再发 B |
| **改同一批文件** | **绝不并行**——冲突 / 互相覆盖。串行，或合并成一个 agent 的连续操作 |

⚠️ **"最多并行"是反模式。** 不是越多 agent 越好：错误并行 = token 翻倍 + 文件冲突 + 难以排查。只有**真独立**的任务才值得并行。拿不准就串行，串行永远安全。

把多个独立的 Agent 调用放在**同一条消息**里发（不是一条条等），这才是并行的正确姿势。

### 派 Agent 时的交代（spawn 纪律）

主循环内"同一条消息发多个 Agent"之外，若 spawn 独立子代理（侧车任务）：

- **交代写范围**：告诉每个 agent "你的写范围是 X，别碰 Y；你不是唯一在改代码的人，遇到不认识的改动**适配它而非 revert**，除非明确要求。"——防并行编辑互相覆盖/回退。多个 agent 的写集必须**不相交**（disjoint write set）。
- **no reflex-wait**：派出去后别反射式空等。去做不重叠的工作，需要结果时再 `wait`——空等 = 烧 token + 卡墙钟。

---

## 3. 重估（Re-plan checkpoint）—— 这才是真正的"loop"

每**完成一个 module**（或卡住时），强制停下来问一遍：

- 剩下的计划**还成立**吗？
- 已完成的模块是否暴露了新信息，需要**重新拆**后面的任务？
- 有没有现在变得独立、可以并行、之前没注意到的事？
- 清单里有该删的废项 / 该加的新项吗？

需要改就更新 `TodoWrite` 再继续。

> **注意区分两种 loop：**
> - 本 skill 的 loop = **任务完成驱动的重规划**（每模块后重估）。这是你要的。
> - 时间驱动轮询（每 N 分钟跑一次）是**另一个** skill：`/loop` + `ScheduleWakeup`。不要混用——对"完成清单"这种目标，时间 loop 只会空转烧 token。

`TodoWrite` 的"标 in_progress → 完成 → 继续"本身已经是任务推进循环；本步加的是**重评估**这一层，防止抱着过时计划埋头干。

---

## 4. 验证完成（Verify before done）

标 done 前**不自证**。每个叶子任务：

- 跑了该跑的验证（测试 / build / typecheck / 肉眼读关键输出 / 端到端驱动一遍）
- 交付物**真的存在**且符合预期，不是"应该好了"

全清单勾完后，**整体复查一遍**再向用户宣布完成。涉及代码改动可调用 `/code-review`（安全相关用 `/security-review`）兜底。

---

## 工具映射

- `TodoWrite` — 清单骨架（分解结果 + 进度跟踪 + 重估后的增删）
- `Agent`（单消息多发）— 独立子任务并行
- `Workflow`（若工具面可用）— **升级路径**：大批量独立 fan-out（如对 N 个文件做同构改造）时用。需用户显式 opt-in（"ultracode" / "use a workflow"），默认不触发，日常用 Agent 单消息多发并行就够

## 单步 mindset 护栏（可选叠加）

本 skill 管**怎么拆、怎么排、怎么验证**。每个叶子任务**执行**时，若风险真实（从零建新模块、改正在跑的代码、需求模糊、棘手 bug），叠加 `karpathy-guidelines` 作单步 mindset 层——抑制过度工程、scope creep、写前不思考、验证草率。两者不竞争：decompose 是骨架，karpathy 是每一步的肌肉记忆。

---

## 何时不该用本 skill

- 单文件小改、一两步的明确任务 → 直接做，别搞仪式
- 只读研究 / 探索代码库 → 用 `Explore`（外部调研配合 WebSearch / WebFetch）
- 每 N 分钟检查某状态（部署、PR）→ 用 `/loop`
- 已有专门 skill 覆盖的场景（如代码审查用 `/code-review`）→ 优先用专门的
