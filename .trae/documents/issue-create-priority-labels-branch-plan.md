# Issue 创建字段与详情弹窗改造计划

## Summary

本次执行以“补齐 issue 创建参数并完成闭环验证”为目标，但根据当前工作树的实际状态，绝大多数代码改动已经在位。执行阶段不应重做设计，而应：

- 保留现有已完成的 UI、GraphQL、REST、core、linear-schema、symphony 侧改动
- 仅在验证暴露缺陷时做最小修正
- 重点完成类型检查、目标测试、接口探针和浏览器 E2E 闭环
- 避免覆盖当前工作区里其他未提交改动，尤其是同目录下已存在的 project 相关修改

## Current State Analysis

基于实际文件读取，当前仓库状态如下：

- 工作区已存在与本任务直接相关的未提交改动：
  - `typescript/apps/linear-local/components/CreateTaskDialog.tsx`
  - `typescript/apps/linear-local/components/KanbanBoard.tsx`
  - `typescript/apps/linear-local/components/TaskCard.tsx`
  - `typescript/apps/linear-local/components/IssueDetailsDialog.tsx`
  - `typescript/apps/linear-local/lib/graphql.ts`
  - `typescript/apps/linear-local/lib/store.ts`
  - `typescript/apps/linear-local/app/api/issues/route.ts`
  - `typescript/packages/core/src/issue.ts`
  - `typescript/packages/linear-schema/src/schema.ts`
  - `typescript/packages/linear-schema/src/resolvers.ts`
  - `typescript/packages/linear-schema/src/store.ts`
  - `typescript/packages/linear-schema/src/database.ts`
  - `typescript/packages/symphony/src/linear-client.ts`
  - `typescript/packages/symphony/src/orchestrator.ts`
  - `typescript/packages/symphony/src/agent-runner.ts`
- `typescript/apps/linear-local/components/CreateTaskDialog.tsx`
  - 已新增 `priority`、`branchName`、`pendingLabel`、`labels` 表单状态
  - 已将 `onCreate` 扩展为传递 `priority`、`branchName`、`labels`
  - 已在提交前使用 `normalizeLabels([...labels, pendingLabel])`
- `typescript/apps/linear-local/components/KanbanBoard.tsx`
  - 已把扩展后的创建参数透传到 `addIssue`
  - 已挂载 `IssueDetailsDialog`
- `typescript/apps/linear-local/lib/graphql.ts`
  - `KanbanIssue.priority` 已改为 `IssuePriority | null`
  - `createIssue()` 已把 `priority`、`branchName`、`labels` 发送到 `IssueCreateInput`
- `typescript/apps/linear-local/lib/store.ts`
  - `addIssue()` 已支持 `priority`、`branchName`、`labels`
- `typescript/apps/linear-local/app/api/issues/route.ts`
  - 已支持 `priority`、`branchName`、`labels` 的解析与归一化
  - 已对非法 `priority` 返回 `400`
- `typescript/packages/core/src/issue.ts`
  - 已定义 `IssuePriority = "none" | "low" | "medium" | "high" | "urgent"`
  - 已提供 `normalizeIssuePriority()`、`issuePriorityLabel()`、`issuePriorityWeight()`
  - `Issue.priority` 已切换为字符串枚举
- `typescript/packages/linear-schema/src/schema.ts`
  - `Issue.priority` 与 `IssueUpdateInput.priority` 已改为 `String`
  - `IssueCreateInput` 已新增 `priority`、`branchName`、`labels`
- `typescript/packages/linear-schema/src/resolvers.ts`
  - `issueCreate` 已写入 `priority`、`branchName`、`labels`
  - `issueUpdate` 已切换为字符串优先级解析
- `typescript/packages/linear-schema/src/store.ts`
  - 内存 store 的 `LocalIssue.priority` 与 `CreateIssueInput` 已支持新字段
- `typescript/packages/linear-schema/src/database.ts`
  - SQLite `issues.priority` 已改为 `text`
  - `createIssue()` / `updateIssue()` / `rowToIssue()` 已走字符串优先级
- `typescript/apps/linear-local/components/IssueDetailsDialog.tsx`
  - 已改为 grid 列表
  - 已用 tag 样式展示 `priority` 与 `labels`
- `typescript/apps/linear-local/components/TaskCard.tsx`
  - 已改为字符串优先级颜色映射与 tag 展示
  - 已支持点击卡片打开详情、拖拽手柄单独负责拖拽
- `typescript/packages/symphony/src/linear-client.ts`
  - 已通过 `normalizeIssuePriority()` 解析字符串优先级
- `typescript/packages/symphony/src/orchestrator.ts`
  - 已通过 `issuePriorityWeight()` 实现字符串优先级排序
- `typescript/packages/symphony/src/agent-runner.ts`
  - 已把 `SYMPHONY_ISSUE_PRIORITY` 切到字符串透传
- 测试文件也已同步更新：
  - `typescript/packages/core/test/issue.test.ts`
  - `typescript/packages/linear-schema/test/graphql.test.ts`
  - `typescript/packages/symphony/test/linear-client.test.ts`
  - `typescript/packages/symphony/test/orchestrator.test.ts`
- 当前最大风险不是设计缺口，而是验证链路：
  - 浏览器侧可能命中旧的 `@symphony/linear-schema` 构建产物或 dev server 缓存
  - 工作区还有 `ProjectsDialog.tsx`、`shared-store.ts` 等其他未提交修改，执行时必须避免误覆盖

## Assumptions & Decisions

- `priority` 全链路固定为字符串枚举：`none | low | medium | high | urgent`
- 排序权重固定为：`urgent > high > medium > low > none`
- `labels` 使用单项录入交互，提交前统一经过 `normalizeLabels()`
- `branchName` 为可选字符串，空值持久化为 `null`
- 详情展示固定采用 grid 列表，`priority` 与 `labels` 固定使用 Tag/Label 风格
- 范围固定覆盖：
  - `linear-local` UI
  - GraphQL `issueCreate`
  - `/api/issues` REST 创建入口
  - Symphony 读取与调度兼容
- 不在本次范围内：
  - project CRUD 交互重做
  - 非本任务触达文件的额外重构
  - 无关格式化或代码风格清洗

## Proposed Changes

### 1. 先做工作树保护与差异复核

- 仅围绕当前已脏的任务相关文件继续工作，不回退现有改动
- 把 `ProjectsDialog.tsx`、`shared-store.ts` 视为并存背景改动，除非验证明确指向它们，否则不动
- 若验证暴露问题，只修改直接导致失败的文件，不扩大范围

### 2. 收尾 `linear-local` 创建链路

- `typescript/apps/linear-local/components/CreateTaskDialog.tsx`
  - 确认 `priority` 选项包含 `none/low/medium/high/urgent`
  - 确认 `labels` 支持 `Enter` 与按钮添加，且重复值不会重复入列
  - 如浏览器验证发现交互瑕疵，只在此文件做最小修正
- `typescript/apps/linear-local/components/KanbanBoard.tsx`
  - 确认创建后的 issue 能进入当前 project 的对应列
- `typescript/apps/linear-local/lib/store.ts`
  - 确认新增字段完整透传且创建成功后直接写回 store
- `typescript/apps/linear-local/lib/graphql.ts`
  - 若接口探针发现 schema 与前端变量不一致，只修正 mutation 变量或响应映射，不改无关查询
- `typescript/apps/linear-local/app/api/issues/route.ts`
  - 验证 REST 与 GraphQL 的字段语义一致

### 3. 收尾 schema/store/持久化链路

- `typescript/packages/core/src/issue.ts`
  - 保持字符串优先级工具为唯一来源，若验证中发现 UI/后端有重复枚举，只向这里收敛
- `typescript/packages/linear-schema/src/schema.ts`
  - 若浏览器仍报 `IssueCreateInput` 缺字段，优先判定为构建产物/缓存问题，而不是立即继续改 schema
- `typescript/packages/linear-schema/src/resolvers.ts`
  - 确认创建与更新对 `priority`、`labels` 的归一化行为一致
- `typescript/packages/linear-schema/src/store.ts`
  - 确认内存 store 在新字段缺省情况下仍回落到 `null` / `[]`
- `typescript/packages/linear-schema/src/database.ts`
  - 如 SQLite 路径下出现旧库兼容问题，仅补最小容错，不做额外迁移设计

### 4. 收尾展示与 orchestration 兼容

- `typescript/apps/linear-local/components/IssueDetailsDialog.tsx`
  - 验证详情弹窗里 `priority`、`labels`、`branchName` 的最终视觉与数据正确
- `typescript/apps/linear-local/components/TaskCard.tsx`
  - 验证卡片点击与拖拽不冲突，优先级 tag 正确显示
- `typescript/packages/symphony/src/linear-client.ts`
  - 验证读取 GraphQL 返回的字符串优先级不会退化为 `null`
- `typescript/packages/symphony/src/orchestrator.ts`
  - 验证高优先级 issue 先调度
- `typescript/packages/symphony/src/agent-runner.ts`
  - 验证 hook 环境变量里 `SYMPHONY_ISSUE_PRIORITY` 传的是字符串枚举

### 5. 执行顺序

- 第一步：跑类型检查和定点测试，先确认代码层面没有回归
- 第二步：若浏览器仍看到旧 schema，先重建 `@symphony/linear-schema` 再启动或重启 `linear-local` dev server
- 第三步：做 GraphQL 探针和 REST 探针，确认服务端链路真实可用
- 第四步：做浏览器 E2E，覆盖创建 issue -> 卡片出现 -> 打开详情 -> 检查 tag/grid
- 第五步：仅在上述步骤失败时做最小修正并重复相应验证

## Verification

执行阶段按以下顺序验证：

1. 类型检查与目标测试
   - `cd /Users/zw/workspace/symphony/typescript && pnpm typecheck`
   - `cd /Users/zw/workspace/symphony/typescript && pnpm exec vitest run packages/core/test/issue.test.ts`
   - `cd /Users/zw/workspace/symphony/typescript && pnpm exec vitest run packages/linear-schema/test/graphql.test.ts`
   - `cd /Users/zw/workspace/symphony/typescript && pnpm exec vitest run packages/symphony/test/linear-client.test.ts packages/symphony/test/orchestrator.test.ts`

2. 服务端构建与探针
   - 若浏览器或 GraphQL 返回旧 schema，先执行 `cd /Users/zw/workspace/symphony/typescript && pnpm --filter @symphony/linear-schema build`
   - 用 GraphQL 直接调用 `issueCreate`，验证返回 `priority`、`branchName`、`labels`
   - 用 `/api/issues` POST 创建 issue，验证返回 JSON 中已持久化新字段

3. 浏览器 E2E
   - 启动隔离的 `linear-local` dev server
   - 打开看板页面
   - 在创建弹窗中填写：
     - `title`
     - `description`
     - `priority = urgent`
     - `branchName = feature/ui-priority`
     - `labels = ["bug", "workflow"]`
   - 提交后验证：
     - 新卡片出现在当前列
     - 卡片上显示优先级 tag
     - 点击卡片能打开详情弹窗
     - 详情弹窗采用 grid 列表
     - 详情中的 `priority`、`labels` 为 tag 展示
     - `branchName`、描述、创建/更新时间显示正确

4. 回归检查
   - 拖拽移动卡片仍可改变状态
   - 切换 project 后 issue 查询仍正常
   - Symphony 侧字符串优先级排序与 hook 透传逻辑保持正确
