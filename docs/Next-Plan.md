
# 下一阶段任务：接入真实 Codex app-server adapter

## 当前状态

Symphony 已完成 run progress 事件模型、CLI run 状态 API、Kanban 轮询展示。

已落地内容：

- `typescript/packages/symphony/src/run-progress.ts`
  - 记录每个 issue 的 latest run 状态和 timeline events。
  - 支持状态：
    - `claimed`
    - `preparing_workspace`
    - `running_hooks`
    - `running_codex`
    - `tool_call`
    - `completed`
    - `failed`
    - `retrying`

- `orchestrator.ts`
  - 派发时记录 `claimed`
  - 失败时记录 `retrying`
  - 已修复正常完成后短暂进入 retrying 的假进度

- `agent-runner.ts`
  - workspace、hooks、Codex、tool call、完成/失败阶段都已上报 progress

- `codex-app-server.ts`
  - 目前已有 `onEvent`
  - 能把当前 JSON-line lifecycle/tool-call 输出向上透出
  - 但还不是完整真实 Codex app-server 协议适配层

- CLI API
  - `/api/v1/state` 已合并 run snapshot
  - `/api/v1/runs` 已新增

- Kanban Web
  - `/api/runs` 代理 CLI `/api/v1/runs`
  - 每 2 秒轮询 issues + runs
  - Task card 展示 `Running Codex`、`Completed` 等 badge

- 验证已通过
  - `rtk pnpm test`
  - `pnpm typecheck`
  - `rm -rf apps/linear-local/.next && rtk pnpm build`
  - `git diff --check -- typescript`
  - Browser E2E 已确认能看到 `Running Codex` 中间态和 `Completed`

## 本轮目标

实现真实 `codex app-server` adapter，替换当前 mock/壳式 `runAppServerTurn`。

核心目标：

给一个真实 issue，Symphony 能：

1. 创建 workspace
2. 启动真实 `codex app-server`
3. 通过 stdio JSONL 发送 app-server JSON-RPC 消息
4. 完成 `initialize` / `initialized`
5. `thread/start` 或 `thread/resume`
6. `turn/start`
7. 持续读取 app-server 事件
8. 把 `threadId`、`turnId`、tool call、command execution、file change、diff、error、completion 等映射到 run progress events
9. 最终让 Codex 在 workspace 中产生实际文件变更，或至少执行可观测命令
10. 通过 `/api/v1/runs` 和 Kanban 看到真实执行进度

## 非目标

本轮不要优先做：

- SSE / WebSocket 实时推送
- SQLite 持久化
- 复杂 timeline UI
- 多 issue 并发调度重构
- 完整审批 UI
- 大规模重写 orchestrator
- 把 Kanban 主 board 做成重日志界面

除非真实 app-server adapter 必须依赖，否则只做最小必要改动。

## 协议实现要求

### 1. 传输方式

第一版只实现 stdio：

```bash
codex app-server
```

不要默认使用 WebSocket。

实现一个 adapter，建议位置：

```txt
typescript/packages/symphony/src/codex-app-server.ts
```

如果当前文件已经存在，优先在原文件内演进，避免新增无意义抽象。

adapter 需要负责：

* spawn `codex app-server`
* stdin 写入 JSONL
* stdout 按行读取 JSONL
* stderr 捕获并写入 run event
* request id 自增
* request/response correlation
* notification dispatch
* timeout
* process exit handling
* cancel/cleanup

### 2. 初始化流程

连接建立后必须按顺序发送：

```json
{
  "method": "initialize",
  "id": 0,
  "params": {
    "clientInfo": {
      "name": "symphony",
      "title": "Symphony",
      "version": "0.1.0"
    }
  }
}
```

收到 initialize response 后发送：

```json
{
  "method": "initialized",
  "params": {}
}
```

然后再启动 thread。

### 3. thread 启动

第一版默认新建 thread：

```json
{
  "method": "thread/start",
  "id": 1,
  "params": {
    "model": "<configured model>",
    "cwd": "<workspace path>",
    "approvalPolicy": "never",
    "sandbox": "workspaceWrite",
    "serviceName": "symphony"
  }
}
```

如果当前项目已有 model/config 来源，复用现有配置，不硬编码新配置系统。

拿到：

```json
{
  "result": {
    "thread": {
      "id": "thr_xxx"
    }
  }
}
```

后写入 run progress：

* `threadId`
* event: `codex.thread.started`

### 4. turn 启动

对 issue 构造 prompt，发送：

```json
{
  "method": "turn/start",
  "id": 2,
  "params": {
    "threadId": "<threadId>",
    "input": [
      {
        "type": "text",
        "text": "<issue prompt>"
      }
    ],
    "cwd": "<workspace path>",
    "approvalPolicy": "never",
    "sandboxPolicy": {
      "type": "workspaceWrite",
      "writableRoots": ["<workspace path>"],
      "networkAccess": true
    }
  }
}
```

拿到：

```json
{
  "result": {
    "turn": {
      "id": "turn_xxx",
      "status": "inProgress"
    }
  }
}
```

后写入 run progress：

* `turnId`
* status: `running_codex`
* event: `codex.turn.started`

## app-server 事件映射

把真实 app-server notification 映射到现有 run progress timeline。

| app-server event                      |                        Symphony status | Symphony event                 |
| ------------------------------------- | -------------------------------------: | ------------------------------ |
| `thread/started`                      |                        `running_codex` | `codex.thread.started`         |
| `turn/started`                        |                        `running_codex` | `codex.turn.started`           |
| `turn/plan/updated`                   |                        `running_codex` | `codex.plan.updated`           |
| `turn/diff/updated`                   |                        `running_codex` | `codex.diff.updated`           |
| `item/started` + `commandExecution`   |                            `tool_call` | `codex.command.started`        |
| `item/completed` + `commandExecution` |                        `running_codex` | `codex.command.completed`      |
| `item/commandExecution/outputDelta`   |                            `tool_call` | `codex.command.output`         |
| `item/started` + `fileChange`         |                            `tool_call` | `codex.file_change.started`    |
| `item/completed` + `fileChange`       |                        `running_codex` | `codex.file_change.completed`  |
| `item/started` + `mcpToolCall`        |                            `tool_call` | `codex.tool_call.started`      |
| `item/completed` + `mcpToolCall`      |                        `running_codex` | `codex.tool_call.completed`    |
| `item/started` + `dynamicToolCall`    |                            `tool_call` | `codex.dynamic_tool.started`   |
| `item/completed` + `dynamicToolCall`  |                        `running_codex` | `codex.dynamic_tool.completed` |
| `item/agentMessage/delta`             |                        `running_codex` | `codex.agent_message.delta`    |
| `turn/completed` with `completed`     |                            `completed` | `codex.turn.completed`         |
| `turn/completed` with `failed`        |                               `failed` | `codex.turn.failed`            |
| `turn/completed` with `interrupted`   | `failed` or current project equivalent | `codex.turn.interrupted`       |
| `error`                               |                               `failed` | `codex.error`                  |
| process stderr line                   |  current status unchanged unless fatal | `codex.stderr`                 |
| process exit before completion        |                               `failed` | `codex.process.exited`         |

保留原始 event payload 的精简版本，避免 timeline 过大。至少保留：

* `method`
* `threadId`
* `turnId`
* `itemId`
* `item.type`
* `item.status`
* `command`
* `cwd`
* `exitCode`
* `durationMs`
* `diff` 是否存在，不一定全文保存
* `error.message`
* `codexErrorInfo`

## 错误处理要求

需要覆盖：

* `codex` 命令不存在
* app-server 初始化超时
* `initialize` 返回 error
* `thread/start` 返回 error
* `turn/start` 返回 error
* stdout 非法 JSON
* stderr 有输出但进程未退出
* app-server 进程提前退出
* `turn/completed.status === "failed"`
* app-server `error` event
* timeout 后 kill child process，并写入 failed run event

失败时必须：

* run status 进入 `failed`
* `finishedAt` 有值
* `error` 写入可读 message
* timeline 有对应 event
* child process 被清理

## 审批策略

第一版用：

```txt
approvalPolicy: never
sandboxPolicy: workspaceWrite
```

如果 app-server 仍发出 approval request，先不要做 UI。adapter 可以采用保守策略：

* 对 command/file change approval request 自动 decline 或记录 unsupported 后 fail
* timeline 写入 `codex.approval.unsupported`
* error message 写清楚需要后续支持 approval flow

不要在没有 UI 和安全边界的情况下自动 accept 未预期 approval。

## 测试要求

### 单元测试

补充或更新 `codex-app-server.ts` 相关测试。

用 fake child process / fake JSONL stream 验证：

1. initialize → initialized → thread/start → turn/start 顺序正确
2. thread id 正确写入 run progress
3. turn id 正确写入 run progress
4. `item/started commandExecution` 映射为 `tool_call`
5. `item/completed commandExecution` 回到 `running_codex`
6. `turn/completed completed` 映射为 `completed`
7. `turn/completed failed` 映射为 `failed`
8. app-server `error` event 映射为 failed
9. 非法 JSON 不会 crash 整个 orchestrator
10. process early exit 会 fail run
11. timeout 会 kill process 并 fail run

### 集成测试

保留现有 mock Codex E2E，不要破坏。

新增一个可选真实 Codex 测试，要求通过环境变量开启，避免 CI 没有 Codex 时失败：

```bash
SYMPHONY_REAL_CODEX_E2E=1
```

真实测试目标：

* 创建一个本地 issue
* 让 Codex 在 workspace 里执行一个非常小的任务
* 验证 run events 包含：

  * `codex.thread.started`
  * `codex.turn.started`
  * 至少一个 `codex.command.*` 或 `codex.file_change.*`
  * `codex.turn.completed`
* 验证 `/api/v1/runs` 能看到 `threadId` 和 `turnId`
* 验证最终状态为 `completed` 或明确可诊断的 `failed`

### 必跑验证

完成后运行：

```bash
rtk pnpm test
pnpm typecheck
rm -rf apps/linear-local/.next && rtk pnpm build
git diff --check -- typescript
```

如果本地有真实 Codex 环境，再运行：

```bash
SYMPHONY_REAL_CODEX_E2E=1 <真实 E2E 命令>
```

## 验收标准

本轮完成的标准：

1. `runAppServerTurn` 不再只是 mock 壳，而是通过真实 `codex app-server` stdio JSONL 协议驱动 Codex。
2. 真实 app-server 的 `threadId`、`turnId` 会写入 run progress。
3. Kanban 仍能看到 `Running Codex`、`Completed`、`Failed`。
4. `/api/v1/runs` 能查到真实 Codex lifecycle timeline。
5. 一个真实 issue 能触发 Codex 在 workspace 内产生实际文件变更，或至少产生可观测 command execution。
6. 所有现有测试、typecheck、build 通过。
7. mock workflow 仍可用，真实 Codex 不可用时不阻塞普通开发和 CI。

## 实施顺序

### Step 1：审查当前实现边界

读取这些文件：

* `typescript/packages/symphony/src/run-progress.ts`
* `typescript/packages/symphony/src/orchestrator.ts`
* `typescript/packages/symphony/src/agent-runner.ts`
* `typescript/packages/symphony/src/codex-app-server.ts`
* `typescript/apps/symphony-cli/src/main.ts`
* `typescript/apps/symphony-cli/src/status-server.ts`
* 现有测试文件

验证条件：

* 明确当前 `runAppServerTurn` 输入/输出
* 明确 run progress tracker API
* 明确 mock Codex workflow 如何被调用
* 明确不能破坏的现有测试

### Step 2：实现 app-server JSONL client

实现最小 JSON-RPC client：

* `sendRequest(method, params): Promise<result>`
* `sendNotification(method, params): void`
* stdout line parser
* response pending map
* notification callback
* stderr callback
* timeout/cleanup

验证条件：

* fake stream 单测通过
* request id correlation 正确
* notification 不会误当 response

### Step 3：实现真实 Codex turn flow

按顺序实现：

1. spawn `codex app-server`
2. initialize
3. initialized
4. thread/start
5. turn/start
6. read notifications until terminal event
7. cleanup process

验证条件：

* fake app-server 流程测试通过
* 真实 Codex 不可用时返回明确错误

### Step 4：事件映射

把 app-server notifications 映射到 run progress。

验证条件：

* 单测覆盖主要 event mapping
* `/api/v1/runs` 能看到映射后的 timeline
* 不把大 payload 无限制塞入 memory

### Step 5：真实 E2E

新增环境变量控制的真实 Codex E2E。

验证条件：

* 默认 CI 不运行真实 Codex E2E
* 设置 `SYMPHONY_REAL_CODEX_E2E=1` 时可运行
* 失败信息可诊断

### Step 6：全量验证

运行：

```bash
rtk pnpm test
pnpm typecheck
rm -rf apps/linear-local/.next && rtk pnpm build
git diff --check -- typescript
```

验证条件：

* 全部通过
* 没有无关格式化
* 没有大范围重构

```

有两个风险点：
第一，`item/*` 才是 turn item 的事实来源，`turn/diff/updated` 和 `turn/plan/updated` 只是聚合/状态更新事件，不能替代 item lifecycle。
第二，失败时 app-server 可能先发 `error` event，再用 `turn/completed` 标记 failed；两者都要处理，不能只等进程退出。
```

## 参考文档

- [App Server – Codex](./Codex-App-Server.md)
