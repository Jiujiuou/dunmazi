import { useState, useEffect } from "react";
import { useGameStore } from "../stores/gameStore";
import {
  ROUND_OPTIONS,
  TARGET_SCORE_OPTIONS,
  DECK_COUNT_OPTIONS,
  HAND_SIZE_OPTIONS,
} from "../constants/gameConfig";
import Logger from "../utils/logger";
import "./Lobby.css";

// localStorage 键名
const STORAGE_KEY_NICKNAME = "poker_game_nickname";

export default function Lobby() {
  // 从 URL 获取房间号（如果有）
  const urlParams = new URLSearchParams(window.location.search);
  const roomFromUrl = urlParams.get("room");

  // 从 localStorage 读取上次的昵称
  const savedNickname = localStorage.getItem(STORAGE_KEY_NICKNAME) || "";

  const [nickname, setNickname] = useState(savedNickname);
  const [roomCode, setRoomCode] = useState(roomFromUrl || "");
  const [mode, setMode] = useState(roomFromUrl ? "join" : "menu"); // 如果URL有房间号，直接进入加入模式
  const [totalRounds, setTotalRounds] = useState(4); // 默认4局
  const [targetScore, setTargetScore] = useState(40); // 默认40分
  const [deckCount, setDeckCount] = useState(1); // 默认1副牌
  const [handSize, setHandSize] = useState(5); // 默认5张手牌（公共区容量同）
  const { createGame, joinGame, loading, error, clearError } = useGameStore();

  // 保存昵称到 localStorage
  const saveNickname = (name) => {
    if (name.trim()) {
      localStorage.setItem(STORAGE_KEY_NICKNAME, name.trim());
    }
  };

  const handleCreateGame = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) return;

    try {
      saveNickname(nickname); // 保存昵称
      Logger.user(
        "创建游戏 昵称:",
        nickname,
        "总局数:",
        totalRounds,
        "目标分:",
        targetScore,
        "牌副数:",
        deckCount,
        "手牌数:",
        handSize,
      );
      await createGame(nickname.trim(), totalRounds, targetScore, deckCount, handSize);
    } catch (err) {
      Logger.error("创建房间失败:", err.message);
    }
  };

  const handleJoinGame = async (e) => {
    e.preventDefault();
    if (!nickname.trim() || !roomCode.trim()) return;

    try {
      saveNickname(nickname); // 保存昵称
      Logger.user("加入游戏 昵称:", nickname, "房间码:", roomCode);
      await joinGame(roomCode.trim(), nickname.trim());
    } catch (err) {
      Logger.error("加入房间失败:", err.message);
    }
  };

  const handleBack = () => {
    setMode("menu");
    setNickname("");
    setRoomCode("");
    clearError();
  };

  return (
    <div className="lobby">
      <div className="lobby-container">
        <div className="lobby-header">
          <h1 className="lobby-title">蹲麻子</h1>
        </div>

        {mode === "menu" && (
          <div className="lobby-menu">
            <button
              className="lobby-button primary"
              onClick={() => setMode("create")}
            >
              创建房间
            </button>
            <button
              className="lobby-button secondary"
              onClick={() => setMode("join")}
            >
              加入房间
            </button>
          </div>
        )}

        {mode === "create" && (
          <form className="lobby-form" onSubmit={handleCreateGame}>
            <div className="form-group">
              <label htmlFor="nickname">昵称</label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="输入你的昵称"
                maxLength={20}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>总局数</label>
              <div className="option-group">
                {ROUND_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`option-button ${totalRounds === option.value ? "selected" : ""} ${option.recommended ? "recommended" : ""}`}
                    onClick={() => setTotalRounds(option.value)}
                  >
                    <div className="option-label">{option.label}</div>
                    <div className="option-desc">{option.duration}</div>
                    {option.recommended && (
                      <div className="option-badge">推荐</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>目标分</label>
              <div className="option-group">
                {TARGET_SCORE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`option-button ${targetScore === option.value ? "selected" : ""} ${option.recommended ? "recommended" : ""}`}
                    onClick={() => setTargetScore(option.value)}
                  >
                    <div className="option-label">{option.label}</div>
                    <div className="option-desc">{option.description}</div>
                    {option.recommended && (
                      <div className="option-badge">推荐</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>牌副数</label>
              <div className="option-group">
                {DECK_COUNT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`option-button ${deckCount === option.value ? "selected" : ""}`}
                    onClick={() => setDeckCount(option.value)}
                  >
                    <div className="option-label">{option.label}</div>
                    <div className="option-desc">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>手牌数</label>
              <div className="option-group">
                {HAND_SIZE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`option-button ${handSize === option.value ? "selected" : ""} ${option.recommended ? "recommended" : ""}`}
                    onClick={() => setHandSize(option.value)}
                  >
                    <div className="option-label">{option.label}</div>
                    <div className="option-desc">{option.description}</div>
                    {option.recommended && (
                      <div className="option-badge">推荐</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="lobby-button secondary"
                onClick={handleBack}
              >
                返回
              </button>
              <button
                type="submit"
                className="lobby-button primary"
                disabled={loading || !nickname.trim()}
              >
                {loading ? "创建中..." : "创建房间"}
              </button>
            </div>
          </form>
        )}

        {mode === "join" && (
          <form className="lobby-form" onSubmit={handleJoinGame}>
            <div className="form-group">
              <label htmlFor="join-nickname">昵称</label>
              <input
                id="join-nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="输入你的昵称"
                maxLength={20}
                autoFocus
              />
            </div>

            <div className="form-group">
              <input
                id="room-code"
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="输入房间号"
                maxLength={6}
              />
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="lobby-button secondary"
                onClick={handleBack}
              >
                返回
              </button>
              <button
                type="submit"
                className="lobby-button primary"
                disabled={loading || !nickname.trim() || !roomCode.trim()}
              >
                {loading ? "加入中..." : "加入房间"}
              </button>
            </div>
          </form>
        )}

        {error && <div className="lobby-error">{error}</div>}
      </div>

      <div className="lobby-background">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>
    </div>
  );
}
