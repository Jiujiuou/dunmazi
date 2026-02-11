# Supabase 数据库设置指南

## 步骤 1: 注册并创建 Supabase 项目

1. 访问 https://supabase.com
2. 点击 "Start your project"
3. 使用 GitHub 账号登录（推荐）
4. 点击 "New Project"
5. 填写项目信息：
   - Name: `poker-game` (或其他名称)
   - Database Password: 设置一个强密码（请记住）
   - Region: 选择离你最近的区域（如 Southeast Asia (Singapore)）
6. 点击 "Create new project"，等待项目创建完成（约 2 分钟）

## 步骤 2: 获取 API 配置信息

1. 项目创建完成后，进入项目主页
2. 点击左侧菜单的 "Settings" (⚙️ 图标)
3. 点击 "API"
4. 找到以下信息：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGc...` (很长的字符串)
5. 复制这两个值，稍后需要配置到项目中

## 步骤 3: 创建数据库表

1. 点击左侧菜单的 "SQL Editor"
2. 点击 "New query"
3. 复制下面的 SQL 代码，粘贴到编辑器中
4. 点击右下角 "Run" 按钮执行

```sql
-- =====================================================
-- 扑克牌游戏数据库表结构
-- =====================================================

-- 1. 游戏房间表
create table games (
  id uuid default gen_random_uuid() primary key,
  room_code text unique not null,
  status text not null check (status in ('waiting', 'playing', 'finished')),
  host_id uuid,
  current_turn integer default 0,

  -- 游戏数据（JSON 格式，灵活适配任何规则）
  game_state jsonb default '{}'::jsonb,

  -- 牌堆相关
  deck jsonb default '[]'::jsonb,
  played_cards jsonb default '[]'::jsonb,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- 2. 玩家表
create table players (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references games(id) on delete cascade,
  nickname text not null,
  position integer not null,

  -- 手牌（JSON 格式）
  hand jsonb default '[]'::jsonb,

  -- 玩家状态（游戏规则相关数据都放这里）
  player_state jsonb default '{}'::jsonb,

  is_online boolean default true,
  joined_at timestamp with time zone default now(),

  unique(game_id, position)
);

-- 3. 游戏动作记录表（可选，用于历史和调试）
create table game_actions (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references games(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  action_type text not null,
  action_data jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

-- 创建索引（性能优化）
create index idx_games_room_code on games(room_code);
create index idx_players_game_id on players(game_id);
create index idx_game_actions_game_id on game_actions(game_id);

-- 启用实时订阅
alter publication supabase_realtime add table games;
alter publication supabase_realtime add table players;

-- =====================================================
-- Row Level Security (RLS) 权限配置
-- =====================================================

-- 启用 RLS
alter table games enable row level security;
alter table players enable row level security;
alter table game_actions enable row level security;

-- 游戏表权限：所有人可读，任何人可创建
create policy "Games are viewable by everyone"
  on games for select
  using (true);

create policy "Anyone can create a game"
  on games for insert
  with check (true);

create policy "Anyone can update a game"
  on games for update
  using (true);

-- 玩家表权限：所有人可见
create policy "Players visible to everyone"
  on players for select
  using (true);

create policy "Anyone can join as player"
  on players for insert
  with check (true);

create policy "Anyone can update player"
  on players for update
  using (true);

create policy "Anyone can delete player"
  on players for delete
  using (true);

-- 动作记录权限：所有人可见和创建
create policy "Actions visible to everyone"
  on game_actions for select
  using (true);

create policy "Anyone can create action"
  on game_actions for insert
  with check (true);

-- =====================================================
-- 完成！
-- =====================================================
-- 如果执行成功，你应该看到 "Success. No rows returned"
-- 现在可以开始使用数据库了！
```

## 步骤 4: 验证表是否创建成功

1. 点击左侧菜单的 "Table Editor"
2. 你应该看到 3 个表：
   - `games`
   - `players`
   - `game_actions`
3. 点击每个表，查看列结构是否正确

## 步骤 5: 配置项目环境变量

1. 在项目根目录创建 `.env` 文件（复制 `.env.example`）
2. 填入之前获取的配置信息：

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...你的anon key...
```

3. 保存文件

## 步骤 6: 启动开发服务器

```bash
npm run dev
```

4. 打开浏览器访问 `http://localhost:5173/poker`
5. 开始游戏！

## 常见问题

### Q: 执行 SQL 时报错怎么办？

A: 检查是否有语法错误，或者尝试分段执行（先创建表，再创建索引，最后配置权限）

### Q: 实时同步不工作？

A: 确保执行了 `alter publication supabase_realtime add table ...` 命令

### Q: 如何重置数据库？

A: 在 SQL Editor 中执行：

```sql
drop table if exists game_actions;
drop table if exists players;
drop table if exists games;
```

然后重新执行创建表的 SQL

### Q: 如何查看数据库中的数据？

A: 点击左侧菜单 "Table Editor"，选择表，即可查看和编辑数据

## 安全提示

- ⚠️ 不要将 `.env` 文件提交到 Git
- ⚠️ 不要分享你的 `VITE_SUPABASE_ANON_KEY`
- ⚠️ 当前权限配置适合开发测试，生产环境需要更严格的权限控制

## 下一步

- 开始开发具体的游戏规则逻辑
- 美化 UI 界面
- 添加音效和动画
- 部署到 Vercel
