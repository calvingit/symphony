# Issue 详情执行面板改造计划

## Summary

本次实现目标是把 `typescript/apps/linear-local/components/IssueDetailsDialog.tsx` 从“基础信息弹窗”升级为面向 Symphony 本地 tracker 的“执行面板”<mccoremem id="03g3n16mw4bzatecbnuflqfno" />。首批范围按你确认的“执行面板增强版”收敛为：

- `Project`
- `Run timeline + last error`
- `Comments`
- `Blocked by / Blocks`
- `Labels` 完整展示
- `identifier / branch / workspace` 等对执行判断有帮助的上下文

其中，`Project`、`Comments`、`Run events` 已有明确数据基础；真正需要新增的数据能力主要是 issue relation 的持久化与查询，以及前端对 run `events` 的消费。

## Current State Analysis

- 当前工作区已经是脏的，且本任务相关目录存在大量未提交改动；执行阶段必须只在明确涉及的文件内工作，不能覆盖用户现有变更。
- `typescript/apps/linear-local/components/IssueDetailsDialog.tsx`
  - 已显示 `identifier`、标题、state、priority、created/updated、branch、labels、description、run status、原始链接。
  - 仍是单层信息卡片，没有 project、comments、relations、run timeline 展开能力。
- `typescript/apps/linear-local/components/KanbanBoard.tsx`
  - 通过 `selectedIssue: KanbanIssue | null` 打开详情。
  - 当前只把列表页里的浅层 `issue` 和 `runs[issue.id]` 传给详情，没有单独的详情加载动作。
- `typescript/apps/linear-local/lib/graphql.ts`
  - `fetchIssues()` 当前只查列表页字段：`id/identifier/title/state/priority/description/branchName/url/labels/updatedAt/createdAt`。
  - 已有 `ProjectRecord`、`ProjectWorkspace`、`RunProgress` 类型。
  - `fetchRunProgress()` 只返回 `/api/runs` 的 `runs`，忽略了同响应里的 `events`。
- `typescript/apps/linear-local/lib/store.ts`
  - store 只维护 `issues`、`runs`、`projects`，没有 `selectedIssueId`、详情缓存、run event 缓存，也没有详情级加载 action。
- `typescript/apps/linear-local/app/api/runs/route.ts`
  - 已把 Symphony 状态服务的 `/api/v1/runs` 透传为 `{ runs, events }`。
  - 当前前端没有使用 `events`。
- `typescript/packages/symphony/src/run-progress.ts`
  - `RunProgressSnapshot` 明确区分 `runs` 与 `events`。
  - `events` 已带有 `status`、`message`、`error`、`eventName`、`details`、`createdAt`，足够做“摘要 + 可展开原始事件”视图。
- `typescript/packages/symphony/src/agent-runner.ts`
  - 已把 claimed/hooks/codex/tool-call/completed/failed 等阶段写入 run progress。
  - 失败事件会带 `error`，可直接用于“最后错误摘要”。
- `typescript/packages/linear-schema/src/schema.ts`
  - `Issue` 已有 `project`、`comments`、`relations` 字段。
  - 但 `relations` 只有 schema，占位未真正接线。
- `typescript/packages/linear-schema/src/resolvers.ts`
  - `Issue.project` 已能从 `projectSlug` 反查项目与 workspace。
  - `Issue.comments` 已能读取评论。
  - `Issue.relations` 当前固定返回空数组。
- `typescript/packages/linear-schema/src/store.ts` 与 `typescript/packages/linear-schema/src/database.ts`
  - 目前只持久化 project / issue / comment，没有 relation 数据结构、store 方法和 SQLite 表。
- `typescript/packages/symphony/src/linear-client.ts`
  - GraphQL 查询已经把 `relations { nodes { type relatedIssue { ... } } }` 查出来。
  - 但 `normalizeIssue()` 目前仍把 `blockedBy` 固定为 `[]`，说明本地 tracker 的 blocker 链路还没打通。

## Assumptions & Decisions

- 详情页定位固定为“执行面板”，不扩展成 Jira 式可编辑大表单。<mccoremem id="03g3n16mw4bzatecbnuflqfno" />
- `Run timeline` 采用“双层呈现”：
  - 默认显示最近一次 run 的阶段摘要与最后错误。
  - 提供可展开的原始事件列表，直接消费 run `events`。
- 详情数据采用“按需加载”而不是把列表查询做成超大 query：
  - 列表继续走 `fetchIssues()`
  - 打开详情时单独查询 `issue(id)` 的详情字段
- `Blocked by / Blocks` 本轮只做只读展示，不做详情内关系编辑 UI。
- 为了让只读展示不是永远为空，本轮同步补齐 local tracker 的 relation 持久化与 GraphQL 查询能力。
- relation 数据结构优先沿用现有 GraphQL `IssueRelation` 形态，不额外发明前端专属字段；详情页和 `LinearClient` 都从 relation type 推导 `blockedBy / blocks`。
- `Labels` 先做“默认折叠 + 展开全部”这一档最小增强，不引入复杂分组规则。
- `identifier` 提供复制操作；`url` 退为辅助链接，不保留主按钮优先级。
- 描述渲染增强优先做到“更好的换行与代码块/Markdown 基础支持”；若仓库没有现成 Markdown 依赖，则优先选最小实现，避免无必要引新依赖。

## Proposed Changes

### 1. 前端数据层补齐“详情 + run events”

- `typescript/apps/linear-local/lib/graphql.ts`
  - 新增详情专用类型，例如：
    - issue 详情中的 `project`
    - `comments`
    - `relations`
    - 更丰富的 labels / branch / url / createdAt / updatedAt
  - 新增 `fetchIssueDetails(id)`，走 `query Issue($id: ID!)`，只在弹窗打开时请求。
  - 将 `fetchRunProgress()` 扩展为返回 `{ runs, events }`，并补前端可消费的 `RunProgressEvent` 类型。
  - 保持 `fetchIssues()` 为看板轻量列表查询，不把 comments/relations/events 塞进列表响应。
- `typescript/apps/linear-local/lib/store.ts`
  - 新增详情态数据：
    - `selectedIssueId`
    - `issueDetailsById`
    - `runEvents`
    - 详情 loading/error 状态
  - 新增 action：
    - 打开 issue 时设置 `selectedIssueId`
    - `loadIssueDetails(id)`
    - `closeIssueDetails()`
  - `loadRuns()` 改为同时缓存 `runs` 和 `events`，并为详情页提供“按 issue 过滤最近一次 attempt”的派生数据。

### 2. 详情弹窗改造成执行面板

- `typescript/apps/linear-local/components/KanbanBoard.tsx`
  - 从“传完整 `selectedIssue` 对象”改为“传 `selectedIssueId + issue detail + run summary/events`”。
  - 打开弹窗时触发详情加载，切换 project 或刷新 issues 后保持当前详情态一致性。
- `typescript/apps/linear-local/components/IssueDetailsDialog.tsx`
  - 重构为更适合执行判断的面板布局，优先顺序固定为：
    - 标题区：title、identifier、复制按钮、当前 state、辅助外链
    - 关键信息区：project、priority、branch、workspace kind/baseBranch、created/updated
    - labels 区：少量直出，多量折叠并支持展开/收起
    - run 区：最近一次 run 阶段摘要、最后错误、可展开原始事件
    - blockers 区：`Blocked by` 与 `Blocks`
    - comments 区：按时间展示评论
    - description 区：增强换行/代码块/Markdown 可读性
  - run 摘要按最近一次 attempt 聚合，核心阶段对齐现有状态流：
    - `claimed`
    - `preparing_workspace`
    - `running_hooks`
    - `running_codex`
    - `completed` / `failed`
  - 原始事件列表显示时间、事件名、message/error/toolName，默认折叠。
  - 若没有 run / comments / blockers，明确显示空态而不是静默省略。
- 若拆分能明显减轻复杂度，可在 `components/` 下新增只被详情页使用的小组件，例如：
  - `RunTimelineSection.tsx`
  - `IssueRelationsSection.tsx`
  - `IssueCommentsSection.tsx`
  - 但仅在 `IssueDetailsDialog.tsx` 明显过大时才拆。

### 3. local tracker 补齐 issue relation 持久化与查询

- `typescript/packages/linear-schema/src/store.ts`
  - 为内存 store 新增 relation 数据结构与方法：
    - 创建 relation
    - 读取某 issue 的 relation
    - 删除 project 时级联清理 relation
  - relation 至少要能表达“当前 issue 被谁阻塞 / 当前 issue 阻塞了谁”。
- `typescript/packages/linear-schema/src/database.ts`
  - 新增 SQLite relation 表。
  - 在删除 project / issue 时级联清理 relation。
  - 为 relation 提供最小 row <-> domain 映射。
- `typescript/packages/linear-schema/src/schema.ts`
  - 保持 `Issue.relations` 为主要读取入口。
  - 如当前 schema 缺少最小写入入口，则补一个最小 mutation 供测试和手动探针写入 blocker 关系；不扩展为完整关系管理 API。
- `typescript/packages/linear-schema/src/resolvers.ts`
  - `Issue.relations` 从 store 实际读取，而不是返回空数组。
  - 若新增 relation mutation，则 resolver 只做最小校验与 store 转发。

### 4. Symphony 兼容链路同步打通 blocker/project 语义

- `typescript/packages/symphony/src/linear-client.ts`
  - 在 `normalizeIssue()` 中把 GraphQL relation 映射为 `Issue.blockedBy`。
  - 保留已有 `project` / `workspace` 读取逻辑。
  - 这样本地 tracker 的 blocker 数据不只是 UI 可见，也能服务 orchestrator 的“是否可执行”判断。
- `typescript/packages/core/src/issue.ts`
  - 只有在 relation 到 `blockedBy` 的映射需要共用辅助类型/函数时才做最小补充；否则保持稳定，避免扩大共享面。

### 5. 测试与验证覆盖

- `typescript/packages/linear-schema/test/graphql.test.ts`
  - 新增 relation 查询与最小 mutation/写入验证。
  - 保持 comments / project 的既有测试不被破坏。
- `typescript/packages/symphony/test/linear-client.test.ts`
  - 新增 relation -> `blockedBy` 映射测试。
- `typescript/apps/linear-local/test/`
  - 为详情页新增最有价值的 UI 测试：
    - 打开详情后显示 project / comments / run summary
    - labels 多时可展开
    - 存在 blocker 时能显示 `Blocked by / Blocks`
  - 如果当前应用侧尚无合适测试基建，则至少补 store/graphql 层测试，并在执行阶段用浏览器手动验证详情 UI。

## Execution Order

1. 先补数据层，不动视觉细节：
   - `linear-schema` 的 relation 持久化与查询
   - `linear-client` blocker 映射
   - `linear-local/lib/graphql.ts` 详情 query 与 run event 类型
2. 再补 `store.ts` 的详情态与 run event 缓存，让弹窗有稳定输入。
3. 最后重构 `IssueDetailsDialog.tsx` 与 `KanbanBoard.tsx`，把 UI 收敛成执行面板。
4. 只在 UI 复杂度明显失控时再拆分小组件，不预先做抽象。

## Verification

执行阶段按以下顺序验证：

1. 目标测试与类型检查
   - `cd /Users/zw/workspace/symphony/typescript && pnpm exec vitest run packages/linear-schema/test/graphql.test.ts`
   - `cd /Users/zw/workspace/symphony/typescript && pnpm exec vitest run packages/symphony/test/linear-client.test.ts`
   - 如新增前端测试，再执行对应 `apps/linear-local/test/...`
   - `cd /Users/zw/workspace/symphony/typescript && pnpm typecheck`

2. 数据探针
   - 通过 GraphQL 直接查询 `issue(id)`，确认返回：
     - `project`
     - `comments`
     - `relations`
   - 通过 `/api/runs` 确认前端可拿到 `runs + events`

3. 浏览器手动验证
   - 打开看板，点击任意卡片进入详情。
   - 核对详情页一眼可见：
     - 这是什么任务
     - 属于哪个项目
     - 当前处于哪个 state
     - 最近一次 run 到了哪一步，失败时最后错误是什么
     - 有无 blocker
     - comments 是否可见
   - 验证 labels 多时可展开/收起。
   - 验证 identifier 可复制、原始 URL 为辅助链接、branch/workspace 信息显示正确。

4. 回归检查
   - 卡片点击打开详情不影响拖拽。
   - 切换 project 后详情不会错误引用旧 project 数据。
   - 没有 run / comments / blockers 的 issue 仍有清晰空态。
