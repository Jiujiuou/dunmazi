import { useEffect, useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { GAME_STATUS, GAME_CONFIG, SHOWDOWN_ACTIONS } from '../constants/gameConfig'
import { canKnock as checkCanKnock, getPlayerStatus } from '../utils/handEvaluation'
import Card from './Card'
import PlayerPosition from './PlayerPosition'
import PlayArea from './PlayArea'
import HandInfo from './HandInfo'
import ShowdownBanner from './ShowdownBanner'
import SettlementModal from './SettlementModal'
import Logger from '../utils/logger'
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
    respondShowdown,
    isMyTurnToRespond,
    getCurrentTurnPlayer,
    isMyTurn,
    refreshGameState,
    performSettlement,
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
  const [settlementData, setSettlementData] = useState(null) // 结算数据

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

  // 🎯 自动触发结算：当所有玩家响应完毕时
  useEffect(() => {
    const shouldTriggerSettlement = 
      game?.game_state?.phase === 'revealing' && 
      game?.game_state?.all_responded === true &&
      !settlementData  // 避免重复触发
    
    if (shouldTriggerSettlement) {
      Logger.game('检测到所有玩家响应完毕 准备结算')
      
      // 延迟1秒后执行结算，让玩家看到最后一个响应
      const timer = setTimeout(async () => {
        try {
          Logger.game('开始执行结算')
          const result = await performSettlement()
          Logger.game('结算完成 赢家:', result.winner?.nickname)
          
          // 保存结算数据到本地状态
          setSettlementData(result)
        } catch (err) {
          Logger.error('结算失败:', err.message)
        }
      }, 1000)
      
      return () => clearTimeout(timer)
    }
  }, [game?.game_state?.phase, game?.game_state?.all_responded, settlementData, performSettlement])

  const handleLeave = async () => {
    if (confirm('确定要离开房间吗?')) {
      await leaveGame()
    }
  }

  const handleToggleReady = async () => {
    try {
      await toggleReady()
    } catch (err) {
      Logger.error('切换准备状态失败:', err.message)
    }
  }

  const handleStartGame = async () => {
    try {
      await startGame()
    } catch (err) {
      Logger.error('开始游戏失败:', err.message)
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
      Logger.error('摸牌失败:', err.message)
    }
  }

  // 摸1打1 - 出牌 / 首回合出牌
  const handlePlayCard = async () => {
    if (selectedCards.length === 0) return
    
    Logger.game('准备出牌 选中牌数:', selectedCards.length, '游戏阶段:', game?.game_state?.phase, '手牌数:', currentPlayer?.hand?.length)
    
    try {
      await playToPublicZone(selectedCards)
      setSelectedCards([])
    } catch (err) {
      Logger.error('出牌失败:', err.message)
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
      Logger.error('强制交换失败:', err.message)
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
      Logger.error('自由交换失败:', err.message)
    }
  }

  // 清场
  const handleClear = async () => {
    try {
      await clearPublicZone()
    } catch (err) {
      Logger.error('清场失败:', err.message)
    }
  }

  // 清场后出牌
  const handlePlayAfterClear = async () => {
    if (selectedCards.length === 0) return
    
    try {
      await playAfterClear(selectedCards)
      setSelectedCards([])
    } catch (err) {
      Logger.error('清场后出牌失败:', err.message)
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
      Logger.error('扣牌失败:', err.message)
    }
  }

  // 响应扣牌 - 随
  const handleFold = async () => {
    try {
      await respondShowdown(SHOWDOWN_ACTIONS.FOLD)
      setSelectedCards([]) // 清空选择
    } catch (err) {
      Logger.error('响应失败:', err.message)
    }
  }

  // 响应扣牌 - 砸
  const handleCall = async () => {
    try {
      await respondShowdown(SHOWDOWN_ACTIONS.CALL)
      setSelectedCards([]) // 清空选择
    } catch (err) {
      Logger.error('响应失败:', err.message)
    }
  }

  // 处理下一局
  const handleNextRound = async () => {
    try {
      Logger.game('准备开始下一局')
      // TODO: 实现下一局逻辑（重新发牌）
      // 暂时先清空结算数据，让玩家回到游戏界面
      setSettlementData(null)
      alert('下一局功能即将上线！')
    } catch (err) {
      Logger.error('开始下一局失败:', err.message)
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

  // 游戏进行中状态（包括 showdown）
  if (game?.status === GAME_STATUS.PLAYING || game?.status === GAME_STATUS.SHOWDOWN) {
    const otherPlayers = getOtherPlayers()
    const currentTurn = game?.game_state?.current_turn || 0
    const deckCount = game?.game_state?.deck?.length || 0
    const publicZone = game?.game_state?.public_zone || []
    const currentPhase = game?.game_state?.phase || 'action_select'
    const roundNumber = game?.game_state?.round_number || 0
    
    const currentTurnPlayer = getCurrentTurnPlayer()
    const isMyTurnNow = isMyTurn()
    const isFirstRound = roundNumber === 0 && currentTurn === 0
    const isShowdown = game?.status === GAME_STATUS.SHOWDOWN

    // 判断可用的行动
    const canDrawAndPlay = publicZone.length < GAME_CONFIG.PUBLIC_ZONE_MAX
    const canForceSwap = publicZone.length > 0 && publicZone.length < GAME_CONFIG.PUBLIC_ZONE_MAX
    const canSelectiveSwap = publicZone.length === GAME_CONFIG.PUBLIC_ZONE_MAX
    const canClear = publicZone.length === GAME_CONFIG.PUBLIC_ZONE_MAX

    return (
      <div className="game-room-playing">
        {/* 游戏信息栏 - 固定在右上角 */}
        <div className="game-info-bar">
          <div className="room-code-display">房间 {game?.room_code}</div>
          <button 
            className="btn-refresh-fixed"
            onClick={refreshGameState}
            title="刷新游戏状态"
          >
            🔄
          </button>
        </div>

        {/* Showdown 横幅 */}
        {isShowdown && <ShowdownBanner />}
        
        {error && (
          <div className="error-toast">
            {error}
            <button 
              className="btn-refresh-state"
              onClick={async () => {
                clearError()
                await refreshGameState()
              }}
              title="刷新游戏状态"
            >
              🔄 刷新
            </button>
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
                {/* Showdown 响应阶段 */}
                {game?.status === GAME_STATUS.SHOWDOWN ? (
                  (() => {
                    const isMyTurn = isMyTurnToRespond()
                    const targetScore = game?.game_state?.target_score || 40
                    const playerStatus = currentPlayer?.hand ? getPlayerStatus(currentPlayer.hand, targetScore) : null
                    
                    if (!isMyTurn) {
                      return (
                        <div className="showdown-waiting">
                          <p className="waiting-text">等待其他玩家响应...</p>
                        </div>
                      )
                    }
                    
                    return (
                      <>
                        {playerStatus?.isMazi && (
                          <div className="showdown-warning">
                            ⚠️ 你是麻子（{playerStatus.isFlush ? '分数不足' : '未达成同花色'}），只能选择"随"
                          </div>
                        )}
                        <button 
                          className="btn-fold"
                          disabled={loading}
                          onClick={handleFold}
                        >
                          <span className="btn-icon">✋</span>
                          <span className="btn-text">随（Fold）</span>
                        </button>
                        <button 
                          className="btn-call"
                          disabled={loading || playerStatus?.isMazi}
                          onClick={handleCall}
                          title={playerStatus?.isMazi ? '麻子不能砸' : '参与比牌'}
                        >
                          <span className="btn-icon">💪</span>
                          <span className="btn-text">砸（Call）</span>
                        </button>
                      </>
                    )
                  })()
                ) : isFirstRound && currentPhase === 'first_play' ? (
                  /* 首回合特殊处理 */
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

  // 结算界面
  if (game?.status === GAME_STATUS.FINISHED && settlementData) {
    return (
      <div className="game-room-playing">
        {/* 游戏信息栏 - 固定在右上角 */}
        <div className="game-info-bar">
          <div className="room-code-display">房间 {game?.room_code}</div>
          <button 
            className="btn-refresh-fixed"
            onClick={refreshGameState}
            title="刷新游戏状态"
          >
            🔄
          </button>
        </div>

        <SettlementModal 
          players={players}
          responses={game.game_state.showdown_responses}
          winnerId={settlementData.winnerId}
          scores={settlementData.scores}
          onNextRound={handleNextRound}
        />
        
        <div className="game-background">
          <div className="pattern pattern-1"></div>
          <div className="pattern pattern-2"></div>
        </div>
      </div>
    )
  }

  return null
}
