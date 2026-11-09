# Relay · 创作者合作自动化

Relay 沿用 Next.js、Prisma 和 SQLite。首页集中管理多条红人合作，详情页分别推进各自的工作流。保存事实后，由服务端判断是否推进，并把邮件和指标任务写入 SQLite。

## 本地运行

使用 Node.js 22.12+（推荐 Node 24）。在本目录运行：

```sh
npm ci
npm run db:setup
npm run dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。`db:setup` 对现有 `prisma/pipeline.db` 执行增量迁移，保留已存合作。空库才会建立示例。另开终端运行 `npm run worker`，进程启动时检查一次，此后每 60 秒检查。用 `npm run worker -- --once` 执行单次检查。页面 Automation 区可查看邮件正文、处理状态和失败原因，点 Reload 获取后台最新状态。

## 状态与触发器

数据库保留原有枚举值，显示名称可单独调整。确认、写入履约记录、状态切换和即时任务入队在同一数据库事务中完成。

| DealStatus | 推进条件 | 触发动作 |
| --- | --- | --- |
| `PITCHING` | 填写主题、形式和内容要求后确认创意范围 | 进入谈判，尚无报价时排队发询价邮件。 |
| `NEGOTIATION` | 记录报价、目标预算、还价及备注。人工确认双方达成的金额 | 记录锁价时间，自动生成并保存可下载的合同草稿，进入履约。 |
| `LOGISTICS_CONTRACT` | 已签合同链接、Brief、收件地址、物流单号、目标上线日、收货日及样品质检通过 | 保存 Brief 和目标日时发 Brief 邮件，缺地址时请求补充。录入物流单号时发发货邮件。条件齐备后自动进入审核。 |
| `DRAFT_REVIEW` | 初稿获得明确批准且已填写活动落地页 | 要求修改时保存审核记录并发反馈邮件。批准后生成 UTM，合并可选 Affiliate URL 和官方 Tags，排队下发后进入上线阶段。 |
| `LIVE_PENDING` | 运营确认视频 URL 和实际发布时间 | 进入效果追踪。创作者提交的 URL 和时间会先保存，供运营确认。 |
| `COMPLETED` | 已确认上线 | Worker 根据实际发布时间安排第 1–7 天指标，每天仅保留一条快照。 |

合同草稿将已确认的创意范围和费率写入可下载文本，签署及归档由运营在现有合同流程中完成。发货和到货提醒发给 `OPS_EMAIL`，脚本、初稿及上线提醒发给创作者。日期类提醒在对应日期 **15:00 UTC** 到期：

- 发货计划日还没有物流单号，或预计寄达日还没有收货记录。
- 目标上线日减 10 天仍缺脚本和初稿。
- 目标上线日减 7 天仍缺初稿，或当前版本已要求修改。
- 目标上线日仍处于待上线阶段。

同一规则与到期日只创建一条任务。Worker 在发送前再次核对当前阶段和数据，取消已过时的邮件。Resend 接收消息后标记为 Done，表示发件服务已受理。队列保留有限重试、处理租约和幂等键。

## 数据模型

| Prisma 模型 | 持久化内容 |
| --- | --- |
| `Creator` | 姓名、账号、平台、邮箱。 |
| `Deal` | 当前阶段、创意要求、目标预算、报价、锁定价、合同状态、地址、物流和排期、当前审核结果、发布素材与上线信息。 |
| `NegotiationEntry`、`ContractDraft` | 追加式议价记录，以及锁价时生成的合同草稿快照。 |
| `Deliverable` | `SAMPLE`、`SCRIPT`、`DRAFT` 的提交、质检和审核事件。换稿后需要重新选择审核结果。 |
| `MetricSnapshot` | 按 `(dealId, dayNumber)` 唯一。记录播放、评论、点击、订单、数据来源和采集时间。 |
| `AutomationJob` | 邮件与指标任务的触发键、预计时间、尝试次数、处理状态及服务回执。 |

## 启用真实邮件与创作者提交

在项目根目录创建 `.env`。默认 `EMAIL_MODE=preview`，Worker 只处理预览。确认发件人、收件人和内容后，设 `EMAIL_MODE=send`、`RESEND_API_KEY`、`EMAIL_FROM`（已验证的发件域名）及 `OPS_EMAIL`。重启 Worker 后会处理待发邮件。已标记 Preview 的记录仅保留作审阅。

配置 `CREATOR_SUBMISSION_SECRET`（至少 32 字符的随机密钥）与 `CREATOR_SUBMISSION_URL` 可给新邮件附上 45 天有效的签名表单链接。表单按阶段接收报价、地址、收货确认、脚本、初稿及发布信息。未配置表单时邮件引导创作者回复发件邮箱，运营把回复录入 Relay。公开使用时，把 HTTPS 反向代理限制为 **仅转发 `/submit`** 的 GET 和 POST，内部控制台和 `/api/deal` 保持在本机或私网。签名链接属于访问凭据。

## 接入指标采集

配置 `METRICS_PROVIDER_URL` 和可选的 `METRICS_PROVIDER_TOKEN`。Worker 向该地址 POST，发送 `dealId`、`platform`、`liveVideoUrl`、`trackingLink`、`affiliateUrl`、`dayNumber` 与 UTC 窗口 `from`、`to`。每个窗口是从实际发布时间起算的连续 24 小时。接入服务须把平台数据和站内归因数据汇合成对应窗口的四个非负整数：

```json
{ "views": 1200, "comments": 36, "clicks": 71, "orders": 4 }
```

Worker 可补抓已到期的缺失天数，手工录入优先保留。未配置采集地址时任务保持待处理，页面仍可手动补录。YouTube、TikTok、Instagram 和订单平台的数据权限由采集服务配置。

## 验证

```sh
npm run build
npm run typecheck
npm test
```

集成测试使用临时 SQLite、邮件预览和模拟指标服务。


## 多红人工作台与客户演示

首页 Workspace 显示本月计划、合作数量和已约定费用，Collaborations 支持搜索与阶段筛选，Marketing calendar 按目标发布日期显示合作。New collaboration 创建独立的红人资料及合作记录，点击红人进入详情。

Deal stage history 记录新增及今后的阶段切换时间。升级前未记录的流转时间显示缺失说明。DEMO 合作中的历史、审核与指标均为虚构演示数据。执行 `npm run db:demo` 可补齐 12 条示例，重复执行保留已有示例编辑。示例合作的邮件强制预览，指标采集跳过外部服务。

数据库结构升级后，请重启 `npm run dev` 和 `npm run worker`，使两个进程加载新的 Prisma Client。
