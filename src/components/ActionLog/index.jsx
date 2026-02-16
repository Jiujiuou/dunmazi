import { useEffect, useState, useRef } from "react";
import { supabase } from "../../config/supabase";
import Card from "../Card";
import "./ActionLog.css";

/** 只展示最近约 20 条（按 DB 行数 limit，过滤后可见条数可能略少），保证最新操作一定会出现 */
const DISPLAY_ENTRIES = 25;
const POLL_INTERVAL_MS = 2500;

/** 两条是否视为重复（同一玩家、同一类型、同一内容，且时间接近） */
function isDuplicateRow(prev, row) {
  if (!prev) return false;
  if (prev.player_id !== row.player_id || prev.action_type !== row.action_type) return false;
  const a = prev.action_data || {};
  const b = row.action_data || {};
  const aCards = (a.cards || []).map((c) => c.id).sort().join(",");
  const bCards = (b.cards || []).map((c) => c.id).sort().join(",");
  if (aCards !== bCards) return false;
  const tA = prev.created_at ? new Date(prev.created_at).getTime() : 0;
  const tB = row.created_at ? new Date(row.created_at).getTime() : 0;
  return Math.abs(tA - tB) < 3000;
}

/** 每条记录：{ id, playerId, nickname, record }；record: { type, cards?, handCards?, publicCards? } */
function buildLogEntries(rows, nicknames) {
  const list = [];
  let prevRow = null;
  for (const row of rows || []) {
    if (isDuplicateRow(prevRow, row)) continue;
    prevRow = row;
    const nickname = row.player_id ? nicknames[row.player_id] : null;
    const name = nickname ?? "?";
    const record = buildRecord(row.action_type, row.action_data || {});
    if (record === null) continue;
    list.push({
      id: row.id,
      playerId: row.player_id,
      nickname: name,
      record,
    });
  }
  return list;
}

function buildRecord(actionType, actionData) {
  switch (actionType) {
    case "draw_card":
      return null;
    case "play_to_public":
    case "play_after_clear": {
      const cards = actionData?.cards || [];
      return { type: "play", cards };
    }
    case "force_swap": {
      const handCards = actionData?.hand_cards_out || [];
      const publicCards = actionData?.public_cards_in || [];
      return { type: "swap", handCards, publicCards };
    }
    case "selective_swap": {
      const handCards = actionData?.hand_cards_out || [];
      const publicCards = actionData?.public_cards_out || [];
      return { type: "swap", handCards, publicCards };
    }
    case "clear_zone": {
      const cards = actionData?.cleared_cards || [];
      return { type: "discard", cards };
    }
    case "knock":
      return { type: "knock" };
    case "fold":
      return { type: "fold" };
    case "call":
      return { type: "call" };
    case "settlement":
      return { type: "settlement" };
    default:
      return { type: "other" };
  }
}

export default function ActionLog({ gameId, players = [] }) {
  const [entries, setEntries] = useState([]);
  const [newEntryId, setNewEntryId] = useState(null);
  const listRef = useRef(null);
  const playersById = useRef({});
  const prevCountRef = useRef(0);

  useEffect(() => {
    playersById.current = players.reduce((acc, p) => {
      acc[p.id] = p.nickname || p.id;
      return acc;
    }, {});
  }, [players]);

  useEffect(() => {
    if (!gameId) return;
    const fetchActions = async () => {
      // 按时间降序取最新 N 条，再反转为升序展示，这样新操作一定会出现在列表里
      const { data, error } = await supabase
        .from("game_actions")
        .select("id, player_id, action_type, action_data, created_at")
        .eq("game_id", gameId)
        .order("created_at", { ascending: false })
        .limit(DISPLAY_ENTRIES);
      if (error) return;
      const chronological = (data || []).slice().reverse();
      const list = buildLogEntries(chronological, playersById.current);
      const prevCount = prevCountRef.current;
      setEntries(list);
      // 仅在「已有记录且新列表多了一条」时标记最新一条为新增，用于入场动画
      if (prevCount > 0 && list.length > prevCount) {
        setNewEntryId(list[list.length - 1].id);
      }
      prevCountRef.current = list.length;
    };
    fetchActions();
    const interval = setInterval(fetchActions, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [gameId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  // 入场动画结束后移除 class，避免重复触发
  useEffect(() => {
    if (!newEntryId) return;
    const t = setTimeout(() => setNewEntryId(null), 320);
    return () => clearTimeout(t);
  }, [newEntryId]);

  return (
    <div className="action-log" aria-label="出牌记录">
      <div className="action-log-list" ref={listRef}>
        {entries.length === 0 ? (
          <div className="action-log-empty"></div>
        ) : (
          <div className="action-log-list-inner">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`action-log-row ${entry.id === newEntryId ? "action-log-row-enter" : ""}`}
            >
              <div className="action-log-avatar" aria-hidden>
                {entry.nickname.charAt(0).toUpperCase()}
              </div>
              <div className="action-log-record">
                {entry.record.type === "play" && (
                  <div className="action-log-cards-row">
                    {(entry.record.cards || []).map((card, i) => (
                      <Card key={`${card.id}-${i}`} card={card} micro />
                    ))}
                  </div>
                )}
                {entry.record.type === "swap" && (
                  <>
                    <div className="action-log-cards-row">
                      {(entry.record.handCards || []).map((card, i) => (
                        <Card key={`h-${card.id}-${i}`} card={card} micro />
                      ))}
                    </div>
                    <div className="action-log-cards-row">
                      {(entry.record.publicCards || []).map((card, i) => (
                        <Card key={`p-${card.id}-${i}`} card={card} micro />
                      ))}
                    </div>
                  </>
                )}
                {entry.record.type === "discard" && (
                  <div className="action-log-cards-row">
                    {(entry.record.cards || []).map((card, i) => (
                      <Card key={`${card.id}-${i}`} card={card} micro />
                    ))}
                  </div>
                )}
                {entry.record.type === "knock" && (
                  <span className="action-log-label">扣牌</span>
                )}
                {entry.record.type === "fold" && (
                  <span className="action-log-label">随</span>
                )}
                {entry.record.type === "call" && (
                  <span className="action-log-label">砸</span>
                )}
                {entry.record.type === "settlement" && (
                  <span className="action-log-label">结算</span>
                )}
                {entry.record.type === "other" && (
                  <span className="action-log-label">—</span>
                )}
              </div>
            </div>
          ))}
          </div>
        )}
      </div>
    </div>
  );
}
