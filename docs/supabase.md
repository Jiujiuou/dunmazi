create table public.game_actions (
  id uuid not null default gen_random_uuid (),
  game_id uuid null,
  player_id uuid null,
  action_type text not null,
  action_data jsonb null default '{}'::jsonb,
  created_at timestamp with time zone null default now(),
  constraint game_actions_pkey primary key (id),
  constraint game_actions_game_id_fkey foreign KEY (game_id) references games (id) on delete CASCADE,
  constraint game_actions_player_id_fkey foreign KEY (player_id) references players (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_game_actions_game_id on public.game_actions using btree (game_id) TABLESPACE pg_default;

create table public.games (
  id uuid not null default gen_random_uuid (),
  room_code text not null,
  status text not null,
  host_id uuid null,
  current_turn integer null default 0,
  game_state jsonb null default '{}'::jsonb,
  deck jsonb null default '[]'::jsonb,
  played_cards jsonb null default '[]'::jsonb,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  total_rounds integer not null default 4,
  current_round integer not null default 1,
  target_score integer not null default 40,
  round_history jsonb not null default '[]'::jsonb,
  constraint games_pkey primary key (id),
  constraint games_room_code_key unique (room_code),
  constraint games_current_round_check check (
    (
      (current_round >= 1)
      and (current_round <= total_rounds)
    )
  ),
  constraint games_status_check check (
    (
      status = any (
        array[
          'waiting'::text,
          'playing'::text,
          'showdown'::text,
          'finished'::text
        ]
      )
    )
  ),
  constraint games_target_score_check check (
    (
      (target_score >= 30)
      and (target_score <= 60)
    )
  ),
  constraint games_total_rounds_check check (
    (
      (total_rounds >= 1)
      and (total_rounds <= 100)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_games_room_code on public.games using btree (room_code) TABLESPACE pg_default;

create index IF not exists idx_games_current_round on public.games using btree (current_round) TABLESPACE pg_default
where
  (
    (status = 'playing'::text)
    or (status = 'showdown'::text)
  );


create table public.players (
  id uuid not null default gen_random_uuid (),
  game_id uuid null,
  nickname text not null,
  position integer not null,
  hand jsonb null default '[]'::jsonb,
  player_state jsonb null default '{}'::jsonb,
  is_online boolean null default true,
  joined_at timestamp with time zone null default now(),
  total_score integer not null default 0,
  round_scores jsonb not null default '[]'::jsonb,
  constraint players_pkey primary key (id),
  constraint players_game_id_position_key unique (game_id, "position"),
  constraint players_game_id_fkey foreign KEY (game_id) references games (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_players_game_id on public.players using btree (game_id) TABLESPACE pg_default;

create index IF not exists idx_players_total_score on public.players using btree (total_score desc) TABLESPACE pg_default;

-- =====================================================
-- game_leaderboard（视图，非表）
-- =====================================================
-- 游戏排行榜视图：基于 games + players 汇总每个游戏中玩家的排名，只读。
--
-- 列说明：
--   game_id      uuid    游戏 ID
--   room_code    text    房间码
--   current_round integer 当前局数
--   total_rounds integer 总局数
--   player_id    uuid    玩家 ID
--   nickname     text    昵称
--   total_score  integer 总积分
--   round_scores jsonb   各局得分
--   rank         bigint  排名（同一 game_id 内）
--
-- 为何显示「UNRESTRICTED」？
--   视图（VIEW）本身没有 RLS；Supabase 对视图会标为 UNRESTRICTED。
--   查询视图时，实际会查底层表（games、players），权限由底层表的 RLS 决定。
--
-- 为何无法在 Table Editor 里 delete？
--   视图是只读的，不能对视图做 INSERT/UPDATE/DELETE。
--   排行榜数据来自 games 与 players，要「清空」或修改排行，应删除或更新
--   对应的 games/players 记录（例如删除某局游戏会级联删除相关 players）。
-- =====================================================