---
name: multi-agent-orchestration
description: Orchestrate sub-agents to complete large tasks — decompose the task first, dispatch independent sub-tasks in parallel via the engine's Task/subagent tool, keep the main context lean (plans and conclusions only, push exploration and trial-and-error down to sub-agents), then verify and merge. Use for any multi-part or context-heavy task. Trigger keywords (多agent, 多智能体, 子agent, 并行, 任务分解, 编排, sub-agent, orchestrate, decompose). Do NOT use for single-step questions or trivial edits the main agent finishes in one pass.
---

# 多 Agent 编排（办公 / 设计 / 开发通用）

模型上下文是稀缺资源。主上下文只应该留下：任务理解、执行计划、各子任务的**结论**、最终交付物。把「读大量材料、探索、试错、跑长输出」全部下沉给子 agent，让它们只回传摘要与结果。

## 编排纪律（收到任务先过一遍）

1. **分解**：把任务拆成可独立验收的子任务；标出依赖关系（串行）与无依赖项（并行）。
2. **预算**：估计每个子任务的读/写量。凡是「要读的东西很多、结论很短」的子任务（检索、阅读资料、摸底代码、收集素材），必须交给子 agent，而不是在主上下文里展开。
3. **派发**：无依赖的子任务**并行**派发；有依赖的按拓扑顺序串行。
4. **回收**：只接受子 agent 的结论性回答（要点、数据、文件路径、成品），拒绝过程性长输出进入主上下文。
5. **验证**：合并前抽查关键子任务结果；发现矛盾派一个子 agent 复核，不自己在主上下文里重读原始材料。
6. **交付**：以计划为骨架汇总成最终成果，标注哪些子任务由哪些子 agent 完成、遗留什么。

## 按引擎落地

### 开发（Claude Code 引擎）
- 用 **Task 工具**派发子 agent（explorer / planner / critic 等定义已内置）。
- 探索类（找文件、读代码、查资料）→ explorer；方案设计 → planner；结果把关 → critic。
- 主上下文只做决策与编排。子 agent 的报告太长时，要求它「重写为 ≤10 行结论」。

### 办公（OpenCode 引擎）
- 用 **Task 工具**（subagent）派发；也可 `@general` / `@explore` 手动点名。
- 文档套件（docx/xlsx/pptx/pdf）产出的中间稿让子 agent 写文件，主上下文只记路径与结论。
- 多来源调研（多个数据源/多份资料）天然并行：每个来源一个子 agent。

### 设计（Zeus 内置引擎）
- 当前会话内没有独立子 agent 工具：改为**阶段化串行**——先产出工作分解（计划），逐阶段执行，每阶段结束立即把中间产物压缩成要点再进入下一阶段，防止上下文膨胀。
- 用 `[LOAD_SKILL: <name>]` 按需加载具体技能（设计系统、数据可视化等），不要依赖记忆。
- 素材探索量大时，先把「要看的清单+每项要看什么」列出来，按清单逐项摘要，不整篇阅读。

## 判定什么时候不要编排

- 单步可答的问题、小改动、只涉及一个文件的小修复：直接做。
- 子任务间强耦合、需要同一份不断变化的状态：保持单上下文，用阶段化纪律控上下文。
- 派发开销（描述任务+回收结果）大于子任务本身：不拆。
