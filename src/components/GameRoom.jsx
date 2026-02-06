import { useEffect, useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { GAME_STATUS, GAME_CONFIG } from '../constants/gameConfig'
import Card from './Card'
import './GameRoom.css'

export default function GameRoom() {
  const { game, currentPlayer, players, leaveGame, toggleReady, startGame, loading, error, clearError } = useGameStore()
  const [copied, setCopied] = useState(false)

  const isHost = currentPlayer?.player_state?.isHost
  const isReady = currentPlayer?.player_state?.isReady || false
  
  // 计算准备状态
  const nonHostPlayers = players.filter(p => !p.player_state?.isHost)
  const readyCount = nonHostPlayers.filter(p => p.player_state?.isReady).length
  const allReady = nonHostPlayers.length > 0 && nonHostPlayers.every(p => p.player_state?.isReady)
  const canStart = isHost && players.length >= GAME_CONFIG.MIN_PLAYERS && allReady

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

  const handleToggleReady = async () => {
    try {
      await toggleReady()
    } catch (err) {
      console.error('切换准备状态失败:', err)
    }
  }

  const handleStartGame = async () => {
    try {
      await startGame()
    } catch (err) {
      console.error('开始游戏失败:', err)
    }
  }

  // 清除错误提示
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

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
                  <div className="player-status">
                    {player.player_state?.isHost ? (
                      <span className="status-text host-status">房主</span>
                    ) : player.player_state?.isReady ? (
                      <span className="status-text ready-status">已准备</span>
                    ) : (
                      <span className="status-text not-ready-status">未准备</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="game-area">
          {game?.status === GAME_STATUS.WAITING && (
            <div className="waiting-state">
              <div className="waiting-icon">♠♥♦♣</div>
              <h2 className="waiting-title">
                {players.length < GAME_CONFIG.MIN_PLAYERS 
                  ? `等待玩家加入 (${players.length}/${GAME_CONFIG.MIN_PLAYERS})` 
                  : '准备开始游戏'
                }
              </h2>
              <p className="waiting-subtitle">
                {isHost 
                  ? `${readyCount}/${nonHostPlayers.length} 位玩家已准备`
                  : isReady 
                    ? '等待房主开始游戏...'
                    : '请点击准备按钮'
                }
              </p>
              
              {error && (
                <div className="game-error">
                  {error}
                </div>
              )}
              
              <div className="game-actions">
                {!isHost && (
                  <button 
                    className={`ready-button ${isReady ? 'ready' : ''}`}
                    onClick={handleToggleReady}
                    disabled={loading}
                  >
                    {isReady ? '取消准备' : '准备'}
                  </button>
                )}
                
                {isHost && (
                  <button 
                    className="start-button"
                    onClick={handleStartGame}
                    disabled={!canStart || loading}
                  >
                    {loading ? '开始中...' : '开始游戏'}
                  </button>
                )}
              </div>
            </div>
          )}

          {game?.status === GAME_STATUS.PLAYING && (
            <div className="playing-state">
              <h2 className="playing-title">游戏进行中</h2>
              <p className="game-info">开始时间: {new Date(game.game_state?.started_at).toLocaleTimeString()}</p>
              
              {/* 显示当前玩家的手牌 */}
              <div className="hand-section">
                <h3 className="hand-title">你的手牌</h3>
                <div className="hand-cards">
                  {currentPlayer?.hand?.length > 0 ? (
                    currentPlayer.hand.map((card, index) => (
                      <Card 
                        key={`${card.id}-${index}`} 
                        card={card}
                      />
                    ))
                  ) : (
                    <p className="no-cards">暂无手牌</p>
                  )}
                </div>
              </div>

              {/* 显示所有玩家的手牌数量 */}
              <div className="all-players-info">
                <h3 className="info-title">玩家手牌数</h3>
                <div className="players-hand-count">
                  {players.map((player) => (
                    <div 
                      key={player.id}
                      className={`player-hand-info ${player.id === currentPlayer?.id ? 'current' : ''}`}
                    >
                      <span className="player-name-small">
                        {player.nickname}
                        {player.id === currentPlayer?.id && ' (你)'}
                      </span>
                      <span className="hand-count">{player.hand?.length || 0} 张</span>
                    </div>
                  ))}
                </div>
              </div>
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
