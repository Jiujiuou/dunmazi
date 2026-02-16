import {
  HiOutlineShare,
  HiOutlineArrowRightOnRectangle,
} from "react-icons/hi2";
import "./WaitingRoom.css";

/**
 * 等待阶段 UI：房间号、玩家列表、准备/开始按钮
 */
export default function WaitingRoom({
  game,
  players = [],
  currentPlayer,
  error,
  loading,
  roomCodeCopied,
  isHost,
  isReady,
  canStart,
  onCopyRoomCode,
  onShareLink,
  onLeave,
  onToggleReady,
  onStartGame,
}) {
  return (
    <div className="game-room-waiting">
      <div className="waiting-header">
        <button
          className="waiting-room-code"
          onClick={onCopyRoomCode}
          title="点击复制房间号"
        >
          房间 {game?.room_code}
          {roomCodeCopied && (
            <span className="copied-tip-waiting">已复制!</span>
          )}
        </button>
        <div className="waiting-header-actions">
          <button
            className="share-link-button"
            onClick={onShareLink}
            title="分享游戏链接"
          >
            <HiOutlineShare size={18} aria-hidden />
            分享链接
          </button>
          <button
            className="leave-button-waiting"
            onClick={onLeave}
            title="离开房间"
          >
            <HiOutlineArrowRightOnRectangle size={18} aria-hidden />
            离开房间
          </button>
        </div>
      </div>

      <div className="waiting-content">
        <div className="waiting-icon" aria-hidden>
          <span className="waiting-suit waiting-suit-spades">♠</span>
          <span className="waiting-suit waiting-suit-hearts">♥</span>
          <span className="waiting-suit waiting-suit-clubs">♣</span>
          <span className="waiting-suit waiting-suit-diamonds">♦</span>
        </div>

        <div className="waiting-players">
          {players.map((player) => (
            <div
              key={player.id}
              className={`waiting-player-card ${player.id === currentPlayer?.id ? "is-current" : ""}`}
            >
              <div className="waiting-player-avatar">
                {player.nickname.charAt(0).toUpperCase()}
              </div>
              <div className="waiting-player-info">
                <div className="waiting-player-name">{player.nickname}</div>
                <div className="waiting-player-status">
                  {player.player_state?.isHost ? (
                    <span className="status-badge status-host">房主</span>
                  ) : player.player_state?.isReady ? (
                    <span className="status-badge status-ready">已准备</span>
                  ) : (
                    <span className="status-badge status-not-ready">
                      未准备
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="waiting-error">{error}</div>}

        <div className="waiting-actions">
          {!isHost && (
            <button
              className={`btn-ready ${isReady ? "ready" : ""}`}
              onClick={onToggleReady}
              disabled={loading}
            >
              {isReady ? "取消准备" : "准备"}
            </button>
          )}

          {isHost && (
            <button
              className="btn-start"
              onClick={onStartGame}
              disabled={!canStart || loading}
            >
              {loading ? "开始中..." : "开始游戏"}
            </button>
          )}
        </div>
      </div>

      <div className="game-background">
        <div className="pattern pattern-1"></div>
        <div className="pattern pattern-2"></div>
      </div>
    </div>
  );
}
