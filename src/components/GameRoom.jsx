import { useEffect, useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { GAME_STATUS, GAME_CONFIG } from '../constants/gameConfig'
import Card from './Card'
import PlayerPosition from './PlayerPosition'
import PlayArea from './PlayArea'
import './GameRoom.css'

export default function GameRoom() {
  const { game, currentPlayer, players, leaveGame, toggleReady, startGame, loading, error, clearError } = useGameStore()
  const [selectedCards, setSelectedCards] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [draggedCards, setDraggedCards] = useState(new Set())
  const [roomCodeCopied, setRoomCodeCopied] = useState(false)

  const isHost = currentPlayer?.player_state?.isHost
  const isReady = currentPlayer?.player_state?.isReady || false
  
  const nonHostPlayers = players.filter(p => !p.player_state?.isHost)
  const readyCount = nonHostPlayers.filter(p => p.player_state?.isReady).length
  const allReady = nonHostPlayers.length > 0 && nonHostPlayers.every(p => p.player_state?.isReady)
  const canStart = isHost && players.length >= GAME_CONFIG.MIN_PLAYERS && allReady

  // 选牌逻辑
  const toggleCardSelection = (card) => {
    setSelectedCards(prev => {
      const isSelected = prev.some(c => c.id === card.id)
      if (isSelected) {
        return prev.filter(c => c.id !== card.id)
      } else {
        return [...prev, card]
      }
    })
  }

  const handleCardClick = (card, e) => {
    e.stopPropagation()
    if (!isDragging) {
      toggleCardSelection(card)
    }
  }

  const handleMouseDown = (card, e) => {
    e.preventDefault()
    const startTime = Date.now()
    
    const checkDrag = setTimeout(() => {
      setIsDragging(true)
      setDraggedCards(new Set([card.id]))
      toggleCardSelection(card)
    }, 100)
    
    const cleanup = () => {
      clearTimeout(checkDrag)
      const duration = Date.now() - startTime
      
      if (duration < 100) {
        // 点击，不做任何事
      }
    }
    
    const handleThisMouseUp = () => {
      cleanup()
      window.removeEventListener('mouseup', handleThisMouseUp)
    }
    
    window.addEventListener('mouseup', handleThisMouseUp)
  }

  const handleMouseEnter = (card) => {
    if (isDragging && !draggedCards.has(card.id)) {
      setDraggedCards(prev => new Set([...prev, card.id]))
      toggleCardSelection(card)
    }
  }

  const handleMouseUp = () => {
    if (isDragging) {
      setTimeout(() => {
        setIsDragging(false)
        setDraggedCards(new Set())
      }, 50)
    }
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp)
      return () => window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  useEffect(() => {
    setSelectedCards([])
  }, [game?.status])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

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

  const handleCopyRoomCode = async () => {
    if (game?.room_code) {
      await navigator.clipboard.writeText(game.room_code)
      setRoomCodeCopied(true)
      setTimeout(() => setRoomCodeCopied(false), 2000)
    }
  }

  // 获取其他玩家（不包括当前玩家）
  const getOtherPlayers = () => {
    if (!currentPlayer) return []
    
    const allPlayers = players.slice().sort((a, b) => a.position - b.position)
    const myIndex = allPlayers.findIndex(p => p.id === currentPlayer.id)
    
    const others = allPlayers.filter(p => p.id !== currentPlayer.id)
    
    // 根据玩家数量映射位置
    const positionMaps = {
      2: ['top'],
      3: ['top-right', 'top-left'],
      4: ['right', 'top', 'left']
    }
    
    const positions = positionMaps[players.length] || []
    
    return others.map((player, index) => ({
      player,
      position: positions[index] || 'top'
    }))
  }

  // 等待状态
  if (game?.status === GAME_STATUS.WAITING) {
    return (
      <div className="game-room-waiting">
        <div className="waiting-header">
          <button 
            className="waiting-room-code"
            onClick={handleCopyRoomCode}
            title="点击复制房间号"
          >
            房间 {game?.room_code}
            {roomCodeCopied && <span className="copied-tip-waiting">已复制!</span>}
          </button>
          <button className="leave-button-waiting" onClick={handleLeave}>
            离开房间
          </button>
        </div>

        <div className="waiting-content">
          <div className="waiting-icon">♠♥♦♣</div>
          <h2 className="waiting-subtitle">
            {players.length < GAME_CONFIG.MIN_PLAYERS 
              ? `等待玩家加入 (${players.length}/${GAME_CONFIG.MIN_PLAYERS})` 
              : '准备开始游戏'}
          </h2>
          <p className="waiting-info">
            {isHost 
              ? `${readyCount}/${nonHostPlayers.length} 位玩家已准备`
              : isReady 
                ? '等待房主开始游戏...'
                : '请点击准备按钮'}
          </p>

          <div className="waiting-players">
            {players.map((player) => (
              <div key={player.id} className="waiting-player-card">
                <div className="waiting-player-avatar">
                  {player.nickname.charAt(0).toUpperCase()}
                </div>
                <div className="waiting-player-info">
                  <div className="waiting-player-name">
                    {player.nickname}
                    {player.player_state?.isHost && <span className="badge-host">房主</span>}
                    {player.id === currentPlayer?.id && <span className="badge-you">你</span>}
                  </div>
                  <div className="waiting-player-status">
                    {player.player_state?.isHost ? null : (
                      player.player_state?.isReady ? (
                        <span className="status-badge status-ready">已准备</span>
                      ) : (
                        <span className="status-badge status-not-ready">未准备</span>
                      )
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
                className={`btn-ready ${isReady ? 'ready' : ''}`}
                onClick={handleToggleReady}
                disabled={loading}
              >
                {isReady ? '取消准备' : '准备'}
              </button>
            )}
            
            {isHost && (
              <button 
                className="btn-start"
                onClick={handleStartGame}
                disabled={!canStart || loading}
              >
                {loading ? '开始中...' : '开始游戏'}
              </button>
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

  // 游戏进行中状态
  if (game?.status === GAME_STATUS.PLAYING) {
    const otherPlayers = getOtherPlayers()
    const currentTurn = game?.game_state?.current_turn || 0
    const deckCount = game?.game_state?.deck?.length || 0
    const currentPlays = game?.game_state?.current_plays || []

    return (
      <div className="game-room-playing">
        {/* 其他玩家位置 */}
        {otherPlayers.map(({ player, position }) => (
          <PlayerPosition
            key={player.id}
            player={player}
            position={position}
            isCurrentTurn={player.position === currentTurn}
          />
        ))}

        {/* 中央出牌区 */}
        <PlayArea 
          currentPlays={currentPlays}
          deckCount={deckCount}
          players={players}
          currentPlayerId={currentPlayer?.id}
        />

        {/* 底部我的手牌区 */}
        <div className="my-hand-area">
          <div className="my-hand-header">
            <div className="my-hand-actions">
              <button 
                className="btn-play"
                disabled={selectedCards.length === 0}
              >
                出牌
              </button>
            </div>
          </div>

          <div className={`my-hand-cards ${isDragging ? 'dragging' : ''}`}>
            {currentPlayer?.hand?.length > 0 ? (
              currentPlayer.hand.map((card, index) => (
                <div
                  key={`${card.id}-${index}`}
                  onMouseDown={(e) => handleMouseDown(card, e)}
                  onMouseEnter={() => handleMouseEnter(card)}
                >
                  <Card 
                    card={card}
                    selected={selectedCards.some(c => c.id === card.id)}
                    onClick={(e) => handleCardClick(card, e)}
                  />
                </div>
              ))
            ) : (
              <p className="no-cards-text">暂无手牌</p>
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

  return null
}
