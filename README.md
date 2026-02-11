# 蹲麻子 (Dunmazi)

2–4 人策略扑克游戏：通过换牌凑齐同花色，在分数达标时「扣牌」，并在最终博弈中争取分数、避免成为「麻子」。

- **技术栈**：React 19 + Vite 7 + Zustand + Supabase（Realtime + PostgreSQL）
- **文档**：见 [docs](./docs) 目录

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量（复制 .env.example 为 .env，填入 Supabase 地址与 anon key）
cp .env.example .env

# 本地开发
npm run dev
```

数据库需先按 [docs/SUPABASE_SETUP.md](./docs/SUPABASE_SETUP.md) 建表并配置 RLS。

## 文档索引

| 文档 | 说明 |
|------|------|
| [游戏规则](./docs/游戏规则.md) | 蹲麻子规则、术语、流程与结算 |
| [架构说明](./docs/架构说明.md) | 项目架构、数据流与扩展指南 |
| [实现进度](./docs/实现进度.md) | 功能完成情况与待办 |
| [UI 配色分析](./docs/UI-Color-Analysis.md) | 配色体系与 CSS 变量规范 |
| [Supabase 设置](./docs/SUPABASE_SETUP.md) | 建表、RLS 与环境变量 |

## 项目结构（简要）

```
src/
├── components/     # 界面组件（Lobby、GameRoom、Card、ActionLog、SettlementModal 等）
├── config/         # Supabase 客户端
├── constants/      # 游戏配置、牌面定义
├── stores/         # Zustand 状态（gameStore）
└── utils/          # 牌型评估(handEvaluation)、比牌(compareHands)、牌工具(cardUtils) 等
```

## 脚本

- `npm run dev` — 开发服务器
- `npm run build` — 生产构建
- `npm run preview` — 预览构建结果
- `npm run lint` — ESLint 检查
