import { useEffect, useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { GAME_STATUS } from '../constants/gameConfig'
import './GameRoom.css'

export default function GameRoom() {
  const { game, currentPlayer, players, leaveGame } = useGameStore()
  const [copied, setCopied] = useState(false)

  const isHost = currentPlayer?.player_state?.isHost

  const handleCopyRoomCode = async () => {
    if (game?.room_code) {
      await navigator.clipboard.writeText(game.room_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleLeave = async () => {
    if (confirm('确定要离开房间吗?')) {
      await leaveGame()
    }
  }

  return (
    <div className="game-room">
      <div className="game-header">
        <div className="room-info">
          <div className="room-code-container">
            <span className="room-label">房间号</span>
            <button 
              className="room-code"
              onClick={handleCopyRoomCode}
              title="点击复制"
            >
              {game?.room_code}
              {copied && <span className="copied-tip">已复制!</span>}
            </button>
          </div>
          <div className="player-count">
            <span className="count-number">{players.length}</span>
            <span className="count-label">位玩家</span>
          </div>
        </div>
        <button className="leave-button" onClick={handleLeave}>
          离开
        </button>
      </div>

      <div className="game-content">
        <div className="players-section">
          <h3 className="section-title">玩家列表</h3>
          <div className="players-grid">
            {players.map((player, index) => (
              <div 
                key={player.id} 
                className={`player-card ${player.id === currentPlayer?.id ? 'current' : ''}`}
              >
                <div className="player-avatar">
                  {player.nickname.charAt(0).toUpperCase()}
                </div>
                <div className="player-info">
                  <div className="player-name">
                    {player.nickname}
                    {player.player_state?.isHost && (
                      <span className="host-badge">房主</span>
                    )}
                    {player.id === currentPlayer?.id && (
                      <span className="you-badge">你</span>
                    )}
                  </div>
                  <div className="player-position">位置 {index + 1}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="game-area">
          {game?.status === GAME_STATUS.WAITING && (
            <div className="waiting-state">
              <div className="waiting-icon">♠♥♦♣</div>
              <h2 className="waiting-title">等待玩家加入...</h2>
              <p className="waiting-subtitle">
                分享房间号给朋友
              </p>
              {isHost && players.length >= 2 && (
                <button className="start-button">
                  开始游戏
                </button>
              )}
            </div>
          )}

          {game?.status === GAME_STATUS.PLAYING && (
            <div className="playing-state">
              <h2>游戏进行中</h2>
              <p>游戏功能待实现...</p>
            </div>
          )}
        </div>
      </div>

      <div className="game-background">
        <div className="pattern pattern-1"></div>
        <div className="pattern pattern-2"></div>
      </div>
    </div>
  )
}
