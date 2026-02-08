import { useGameStore } from '../stores/gameStore'
import { RESPONSE_STATUS } from '../constants/gameConfig'
import "./PlayerPosition.css"

export default function PlayerPosition({ player, position, isCurrentTurn }) {
  const { game, getPlayerResponseStatus, getKnockerInfo } = useGameStore()
  
  if (!player) return null

  const cardCount = player.hand?.length || 0
  
  // 检查是否在 showdown 阶段
  const isShowdown = game?.status === 'showdown'
  const knocker = isShowdown ? getKnockerInfo() : null
  const isKnocker = isShowdown && knocker?.id === player.id
  
  // 获取响应状态
  const responseStatus = isShowdown ? getPlayerResponseStatus(player.id) : null
  const response = isShowdown ? game.game_state?.showdown_responses?.[player.id] : null

  return (
    <div className={`player-position player-position-${position}`}>
      <div className={`player-cards ${isCurrentTurn ? "current-turn" : ""} ${isKnocker ? "knocker" : ""}`}>
        {/* 扣牌者标记 */}
        {isKnocker && <div className="knocker-badge">🎯 扣</div>}
        
        {/* 卡片展示 */}
        <div className="cards-display">
          {Array.from({ length: cardCount }).map((_, index) => (
            <div
              key={index}
              className="card-back"
              style={{ "--index": index }}
            ></div>
          ))}
        </div>
        
        {/* 玩家名字在卡片底部 */}
        <div className="player-info-bottom">
          <span className="player-nickname">{player.nickname}</span>
          
          {/* Showdown 响应状态指示器 */}
          {isShowdown && !isKnocker && (
            <div className="response-indicator">
              {responseStatus === RESPONSE_STATUS.RESPONDED && response && (
                <div className={`response-badge ${response.action}`}>
                  {response.action === 'fold' ? '✓ 随' : '💪 砸'}
                </div>
              )}
              {responseStatus === RESPONSE_STATUS.PENDING && (
                <div className="response-badge pending">⏳ 响应中</div>
              )}
              {responseStatus === RESPONSE_STATUS.NOT_YET && (
                <div className="response-badge not-yet">🔒 等待</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
