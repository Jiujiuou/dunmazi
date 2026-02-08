import { useEffect, useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { GAME_STATUS, GAME_CONFIG } from '../constants/gameConfig'
import { canKnock as checkCanKnock } from '../utils/handEvaluation'
import Card from './Card'
import PlayerPosition from './PlayerPosition'
import PlayArea from './PlayArea'
import HandInfo from './HandInfo'
import './GameRoom.css'

export default function GameRoom() {
  const { 
    game, 
    currentPlayer, 
    players, 
    leaveGame, 
    toggleReady, 
    startGame, 
    drawCard,
    playToPublicZone,
    forceSwap,
    selectiveSwap,
    clearPublicZone,
    playAfterClear,
    knock,
    getCurrentTurnPlayer,
    isMyTurn,
    loading, 
    error, 
    clearError 
  } = useGameStore()
  
  const [selectedCards, setSelectedCards] = useState([])
  const [selectedPublicCards, setSelectedPublicCards] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [draggedCards, setDraggedCards] = useState(new Set())
  const [roomCodeCopied, setRoomCodeCopied] = useState(false)
  const [swapMode, setSwapMode] = useState(null) // 'force' | 'selective' | null

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
      
      // 如果已选中，则取消选中；否则加入选中
      if (isSelected) {
        return prev.filter(c => c.id !== card.id)
      } else {
        return [...prev, card]
      }
    })
  }

  // 公共区选牌
  const togglePublicCardSelection = (card) => {
    setSelectedPublicCards(prev => {
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
    setSelectedPublicCards([])
    setSwapMode(null)
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

  const handleShareLink = async () => {
    if (game?.room_code) {
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${game.room_code}`
      await navigator.clipboard.writeText(shareUrl)
      setRoomCodeCopied(true)
      setTimeout(() => setRoomCodeCopied(false), 2000)
    }
  }

  // 摸1打1 - 摸牌（直接执行，不需要选择阶段）
  const handleDrawCard = async () => {
    try {
      // 如果在 action_select 阶段，先验证公共区是否已满
      const publicZone = game?.game_state?.public_zone || []
      if (publicZone.length >= GAME_CONFIG.PUBLIC_ZONE_MAX) {
        throw new Error('公共区已满，不能摸牌')
      }
      
      await drawCard()
    } catch (err) {
      console.error('摸牌失败:', err)
    }
  }

  // 摸1打1 - 出牌 / 首回合出牌
  const handlePlayCard = async () => {
    if (selectedCards.length === 0) return
    
    console.log('========== handlePlayCard 开始 ==========')
    console.log('准备出牌，选中的牌:', selectedCards)
    console.log('当前游戏阶段:', game?.game_state?.phase)
    console.log('当前手牌数:', currentPlayer?.hand?.length)
    
    try {
      await playToPublicZone(selectedCards)
      console.log('playToPublicZone 调用成功')
      setSelectedCards([])
      console.log('========== handlePlayCard 结束 ==========')
    } catch (err) {
      console.error('========== handlePlayCard 错误 ==========')
      console.error('出牌失败:', err)
    }
  }

  // 开始N换N
  const handleStartForceSwap = () => {
    setSwapMode('force')
    setSelectedCards([])
    setSelectedPublicCards([])
  }

  // 确认N换N
  const handleConfirmForceSwap = async () => {
    try {
      await forceSwap(selectedCards)
      setSelectedCards([])
      setSelectedPublicCards([])
      setSwapMode(null)
    } catch (err) {
      console.error('强制交换失败:', err)
    }
  }

  // 开始M换M
  const handleStartSelectiveSwap = () => {
    setSwapMode('selective')
    setSelectedCards([])
    setSelectedPublicCards([])
  }

  // 确认M换M
  const handleConfirmSelectiveSwap = async () => {
    try {
      await selectiveSwap(selectedCards, selectedPublicCards)
      setSelectedCards([])
      setSelectedPublicCards([])
      setSwapMode(null)
    } catch (err) {
      console.error('自由交换失败:', err)
    }
  }

  // 清场
  const handleClear = async () => {
    try {
      await clearPublicZone()
    } catch (err) {
      console.error('清场失败:', err)
    }
  }

  // 清场后出牌
  const handlePlayAfterClear = async () => {
    if (selectedCards.length === 0) return
    
    try {
      await playAfterClear(selectedCards)
      setSelectedCards([])
    } catch (err) {
      console.error('清场后出牌失败:', err)
    }
  }

  // 取消交换模式
  const handleCancelSwap = () => {
    setSwapMode(null)
    setSelectedCards([])
    setSelectedPublicCards([])
  }

  // 扣牌
  const handleKnock = async () => {
    try {
      await knock()
    } catch (err) {
      console.error('扣牌失败:', err)
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
          <div className="waiting-header-actions">
            <button 
              className="share-link-button"
              onClick={handleShareLink}
              title="分享游戏链接"
            >
              🔗 分享链接
            </button>
            <button className="leave-button-waiting" onClick={handleLeave}>
              离开房间
            </button>
          </div>
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
    const publicZone = game?.game_state?.public_zone || []
    const currentPhase = game?.game_state?.phase || 'action_select'
    const roundNumber = game?.game_state?.round_number || 0
    
    const currentTurnPlayer = getCurrentTurnPlayer()
    const isMyTurnNow = isMyTurn()
    const isFirstRound = roundNumber === 0 && currentTurn === 0

    // 🔍 添加公共区变化监听日志
    console.log('========== GameRoom 渲染 ==========')
    console.log('当前回合:', currentTurn)
    console.log('当前阶段:', currentPhase)
    console.log('回合数:', roundNumber)
    console.log('是否首回合:', isFirstRound)
    console.log('公共区数据:', publicZone)
    console.log('公共区牌数:', publicZone.length)
    console.log('是否轮到我:', isMyTurnNow)
    console.log('我的手牌数:', currentPlayer?.hand?.length)
    console.log('===================================')

    // 判断可用的行动
    const canDrawAndPlay = publicZone.length < GAME_CONFIG.PUBLIC_ZONE_MAX
    const canForceSwap = publicZone.length > 0 && publicZone.length < GAME_CONFIG.PUBLIC_ZONE_MAX
    const canSelectiveSwap = publicZone.length === GAME_CONFIG.PUBLIC_ZONE_MAX
    const canClear = publicZone.length === GAME_CONFIG.PUBLIC_ZONE_MAX

    return (
      <div className="game-room-playing">
        {error && (
          <div className="error-toast">
            {error}
          </div>
        )}

        {otherPlayers.map(({ player, position }) => (
          <PlayerPosition
            key={player.id}
            player={player}
            position={position}
            isCurrentTurn={player.position === currentTurn}
          />
        ))}

        <PlayArea 
          publicZone={publicZone}
          deckCount={deckCount}
          onPublicCardClick={swapMode === 'selective' ? togglePublicCardSelection : null}
          selectedPublicCards={selectedPublicCards}
        />

        {/* 手牌信息提示卡片 - 固定在右下角 */}
        <HandInfo 
          hand={currentPlayer?.hand || []}
          targetScore={game?.game_state?.target_score || 40}
        />

        <div className="my-hand-area">
          <div className="my-hand-header">
            {swapMode ? (
              <div className="swap-mode-info">
                <p className="swap-instruction">
                  {swapMode === 'force' && `N换N：请从手牌选择 ${publicZone.length} 张牌，将与公共区所有牌交换`}
                  {swapMode === 'selective' && '自由换牌：请选择手牌和公共区的牌进行交换（数量相同）'}
                </p>
                <div className="swap-actions">
                  <button 
                    className="btn-confirm-swap"
                    disabled={
                      swapMode === 'force' 
                        ? selectedCards.length !== publicZone.length
                        : selectedCards.length === 0 || selectedCards.length !== selectedPublicCards.length
                    }
                    onClick={swapMode === 'force' ? handleConfirmForceSwap : handleConfirmSelectiveSwap}
                  >
                    确认交换
                  </button>
                  <button 
                    className="btn-cancel-swap"
                    onClick={handleCancelSwap}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="my-hand-actions">
                {/* 首回合特殊处理 */}
                {isFirstRound && currentPhase === 'first_play' ? (
                  <button 
                    className="btn-play"
                    disabled={selectedCards.length === 0 || !isMyTurnNow}
                    onClick={handlePlayCard}
                  >
                    出1张牌
                  </button>
                ) : currentPhase === 'action_select' ? (
                  <>
                    <button 
                      className="btn-draw"
                      disabled={!canDrawAndPlay || !isMyTurnNow}
                      onClick={handleDrawCard}
                      title={!canDrawAndPlay ? '公共区已满' : ''}
                    >
                      摸牌
                    </button>
                    <button 
                      className="btn-action"
                      disabled={!canForceSwap || !isMyTurnNow}
                      onClick={handleStartForceSwap}
                      title={!canForceSwap ? '公共区数量不符合' : ''}
                    >
                      {publicZone.length}换{publicZone.length}
                    </button>
                    <button 
                      className="btn-action"
                      disabled={!canSelectiveSwap || !isMyTurnNow}
                      onClick={handleStartSelectiveSwap}
                      title={!canSelectiveSwap ? '公共区未满' : ''}
                    >
                      自由换牌
                    </button>
                    <button 
                      className="btn-action"
                      disabled={!canClear || !isMyTurnNow}
                      onClick={handleClear}
                      title={!canClear ? '公共区未满' : ''}
                    >
                      弃牌
                    </button>
                    <button 
                      className={`btn-knock ${checkCanKnock(currentPlayer?.hand || [], game?.game_state?.target_score || 40).canKnock ? 'can-knock' : 'cannot-knock'}`}
                      disabled={!checkCanKnock(currentPlayer?.hand || [], game?.game_state?.target_score || 40).canKnock || !isMyTurnNow}
                      onClick={handleKnock}
                      title={checkCanKnock(currentPlayer?.hand || [], game?.game_state?.target_score || 40).reason}
                    >
                      扣牌
                    </button>
                  </>
                ) : currentPhase === 'play_after_draw' ? (
                  <button 
                    className="btn-play"
                    disabled={selectedCards.length === 0 || !isMyTurnNow}
                    onClick={handlePlayCard}
                  >
                    出牌
                  </button>
                ) : currentPhase === 'play_after_clear' ? (
                  <button 
                    className="btn-play"
                    disabled={selectedCards.length === 0 || !isMyTurnNow}
                    onClick={handlePlayAfterClear}
                  >
                    出1张牌
                  </button>
                ) : null}
              </div>
            )}
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
