# OneBot Bridge 接入说明 v0.1

> 目标：把 `AIKP` 现有的 `runtime + http-bridge` 接到真实 OneBot 链路里，先跑测试群，再决定是否扩到主链。

## 1. 当前已有的链路能力

仓库内已具备三层：
- `adapter/onebot/single-session.js`：跑团玩法层
- `adapter/onebot/runtime.js`：OneBot 事件标准化与过滤层
- `adapter/onebot/http-bridge.js`：HTTP 接线层（收事件 / 返回 send action / 可选直连回发）

其中 `http-bridge` 已支持：
- `POST /onebot/event`
- `GET /health`
- `POST /authoring/import/scene`
- `POST /authoring/import/campaign`
- `POST /authoring/import/story-pack`

## 2. 两种接法

### 方案 A：影子联调（推荐先用）
NapCat / OneBot 保持现有主链不动，只额外把消息事件投递给 AIKP bridge 做观测。

优点：
- 风险低
- 不影响现有聊天
- 最适合先抓格式/回环/清洗问题

缺点：
- AIKP 不会成为真正的回复主链
- 更像旁路观测与烟测

### 方案 B：测试群直连 AIKP bridge
让测试群的 OneBot 消息直接进入 AIKP bridge，bridge 再回调 OneBot HTTP API 发回 QQ。

优点：
- 能真实验证跑团聊天体验
- 最接近最终形态

缺点：
- 要小心重复消费
- 要防 bot 自己回环

## 3. 启动 bridge

在仓库根目录运行：

```bash
node adapter/onebot/http-bridge.js
```

可用环境变量：

```bash
AIKP_ONEBOT_PORT=8787
AIKP_ONEBOT_EVENT_PATH=/onebot/event
AIKP_ONEBOT_HEALTH_PATH=/health
AIKP_STORAGE_ROOT=/home/node/clawd/clawd-ai-kp/runtime/onebot
AIKP_ONEBOT_AUTO_SEND=true
AIKP_ONEBOT_API_BASE_URL=http://127.0.0.1:5700
```

建议测试阶段先分两步：
- 第一步：`AIKP_ONEBOT_AUTO_SEND=false`（只看返回动作，不真发回）
- 第二步：`AIKP_ONEBOT_AUTO_SEND=true`（真发回测试群）

## 4. NapCat / OneBot 侧需要知道什么

最小接入信息：
- 事件上报地址：`http://<bridge-host>:8787/onebot/event`
- HTTP API 地址：`http://<onebot-api-host>:5700`
- 若 bridge 与 OneBot 在同一主机上，可优先用局域网/本机可达地址

## 5. 推荐 smoke test 顺序

### 5.1 先测命令
- `/aikp roll journalist`
- `/aikp sheet`
- `/aikp state`
- `/aikp campaign`
- `/aikp hooks`

### 5.2 再测场景动作
- `我借着手电去看祭坛背后的刮痕`
- `我先安抚守墓人，再把话慢慢引到昨晚的钟声上`
- `/aikp clues`
- `/aikp npcs`
- `/aikp recap`

### 5.3 最后测切幕
- `/aikp advance`
- `/aikp goto bell-tower-followup`
- `/aikp storypack`

## 6. 联调重点看什么

- 是否出现重复回复
- 是否 bot 自己发的消息又被吃回来
- CQ at / CQ 段是否被正确清洗
- group / private 是否回对地方
- `runtime/onebot` 下会话是否正常落盘
- 非 message 事件是否被安静忽略
- 返回文本是否过长、过重复

## 7. 当前已做的防护

- 非 `post_type=message` 事件会忽略
- bot 自己的消息会忽略
- CQ at / 其他 CQ 片段会先清洗
- 空消息不触发流程

## 8. 当前结论

到现在为止，代码层已经非常接近真实接线：
- 桥接层有
- 回发层有
- 作者导入层有
- 测试也全绿

真正还没做的，是把这套配置到现有 OneBot 实际环境里，然后跑测试群 smoke test。
