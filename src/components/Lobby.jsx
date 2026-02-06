import { useState } from "react";
import { useGameStore } from "../stores/gameStore";
import "./Lobby.css";

export default function Lobby() {
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [mode, setMode] = useState("menu"); // menu, create, join
  const { createGame, joinGame, loading, error, clearError } = useGameStore();

  const handleCreateGame = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) return;

    try {
      await createGame(nickname.trim());
    } catch (err) {
      console.error("创建房间失败:", err);
    }
  };

  const handleJoinGame = async (e) => {
    e.preventDefault();
    if (!nickname.trim() || !roomCode.trim()) return;

    try {
      await joinGame(roomCode.trim(), nickname.trim());
    } catch (err) {
      console.error("加入房间失败:", err);
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
          <h1 className="lobby-title">扑克游戏</h1>
          <p className="lobby-subtitle">邀请朋友一起玩</p>
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
