# 扑克牌游戏项目

一个基于 React + Supabase 的多人在线扑克牌游戏。

## 技术栈

- **前端**: React 18 + Vite
- **状态管理**: Zustand
- **数据库 & 实时同步**: Supabase
- **路由**: React Router DOM
- **样式**: Less + CSS Modules

## 项目结构

```
src/
├── config/
│   └── supabase.js          # Supabase 客户端配置
├── store/
│   └── gameStore.js         # 游戏状态管理 (Zustand)
├── utils/
│   ├── cardUtils.js         # 扑克牌通用工具函数
│   └── gameLogic.js         # 游戏规则逻辑（可自定义）
├── components/
│   ├── Card/                # 扑克牌组件
│   ├── Lobby/               # 大厅（创建/加入房间）
│   ├── GameRoom/            # 游戏房间
│   └── ...                  # 其他原有组件
└── App.jsx                  # 主应用（路由配置）
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Supabase

请参考 [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) 完成以下步骤：

1. 注册 Supabase 账号
2. 创建项目
3. 执行建表 SQL
4. 配置环境变量

### 3. 配置环境变量

复制 `.env.example` 为 `.env`，填入你的 Supabase 配置：

```env
VITE_SUPABASE_URL=你的项目URL
VITE_SUPABASE_ANON_KEY=你的anon key
```

### 4. 启动开发服务器

```bash
npm run dev
```

### 5. 访问游戏

打开浏览器访问：`http://localhost:5173/poker`

## 游戏功能

### ✅ 已实现功能

- [x] 创建游戏房间
- [x] 加入游戏房间（通过房间号）
- [x] 实时同步游戏状态
- [x] 多人在线（2-4 人）
- [x] 自动发牌
- [x] 基础出牌逻辑
- [x] 显示其他玩家手牌数量
- [x] 房间号复制功能
- [x] 离开游戏功能

### 🚧 待实现功能（根据具体游戏规则）

游戏规则部分需要根据你想玩的具体扑克游戏来实现，例如：

- [ ] 斗地主规则
- [ ] 德州扑克规则
- [ ] UNO 规则
- [ ] 其他自定义规则

## 如何自定义游戏规则

所有游戏规则相关的逻辑都在 `src/utils/gameLogic.js` 文件中：

```javascript
// 1. 修改游戏配置
export const GAME_CONFIG = {
  MIN_PLAYERS: 2,        // 最少玩家数
  MAX_PLAYERS: 4,        // 最多玩家数
  CARDS_PER_PLAYER: 5,   // 每人发牌数量
  USE_JOKERS: false,     // 是否使用大小王
}

// 2. 修改出牌验证逻辑
static canPlayCard(player, card, gameState) {
  // 在这里实现你的游戏规则
  return true
}

// 3. 修改获胜条件
static checkGameEnd(players, gameState) {
  // 在这里实现获胜判定
  return null
}
```

## 数据库表结构

### games 表（游戏房间）

| 字段         | 类型  | 说明                             |
| ------------ | ----- | -------------------------------- |
| id           | uuid  | 主键                             |
| room_code    | text  | 房间号（6 位）                   |
| status       | text  | 状态（waiting/playing/finished） |
| host_id      | uuid  | 房主 ID                          |
| game_state   | jsonb | 游戏状态（JSON，灵活存储）       |
| deck         | jsonb | 牌堆                             |
| played_cards | jsonb | 已出的牌                         |

### players 表（玩家）

| 字段         | 类型    | 说明                       |
| ------------ | ------- | -------------------------- |
| id           | uuid    | 主键                       |
| game_id      | uuid    | 游戏 ID（外键）            |
| nickname     | text    | 昵称                       |
| position     | integer | 座位号                     |
| hand         | jsonb   | 手牌                       |
| player_state | jsonb   | 玩家状态（JSON，灵活存储） |

### game_actions 表（游戏动作记录）

| 字段        | 类型  | 说明     |
| ----------- | ----- | -------- |
| id          | uuid  | 主键     |
| game_id     | uuid  | 游戏 ID  |
| player_id   | uuid  | 玩家 ID  |
| action_type | text  | 动作类型 |
| action_data | jsonb | 动作数据 |

## 实时同步机制

项目使用 Supabase Realtime 实现多人实时同步：

```javascript
// 自动订阅游戏状态变化
supabase
  .channel(`game:${gameId}`)
  .on(
    "postgres_changes",
    {
      event: "*",
      table: "games",
    },
    handleUpdate
  )
  .subscribe();
```

当任何玩家操作时：

1. 更新 Supabase 数据库
2. Supabase 自动推送变更到所有订阅者
3. 所有玩家界面实时更新

## 部署到 Vercel

1. 将代码推送到 GitHub
2. 在 Vercel 导入仓库
3. 配置环境变量（添加 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`）
4. 部署完成！

## 常见问题

### Q: 如何修改最大玩家数？

A: 修改 `src/utils/gameLogic.js` 中的 `GAME_CONFIG.MAX_PLAYERS`

### Q: 如何添加大小王？

A: 修改 `src/utils/gameLogic.js` 中的 `GAME_CONFIG.USE_JOKERS` 为 `true`

### Q: 如何修改每人发牌数量？

A: 修改 `src/utils/gameLogic.js` 中的 `GAME_CONFIG.CARDS_PER_PLAYER`

### Q: 原有项目功能是否受影响？

A: 不影响！游戏功能只在 `/poker` 和 `/game/:id` 路径下激活，其他路径保持原样

## 下一步开发建议

1. **确定游戏规则**：先决定玩什么游戏（斗地主、德州扑克等）
2. **实现游戏逻辑**：在 `gameLogic.js` 中实现具体规则
3. **优化 UI**：添加动画、音效、更好的视觉效果
4. **添加功能**：聊天、战绩统计、房间密码等
5. **测试**：邀请朋友一起测试多人功能

## 技术支持

如有问题，请检查：

- Supabase 项目是否正常运行
- 环境变量是否正确配置
- 浏览器控制台是否有报错信息

## 许可证

MIT
