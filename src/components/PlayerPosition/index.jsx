import { useGameStore } from '../../stores/gameStore'
import { RESPONSE_STATUS } from '../../constants/gameConfig'
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
      <div className={`player-cards ${isKnocker ? "knocker" : ""}`}>
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
        
        {/* 玩家信息：胶囊容器，左下角绝对定位；左头像（同 action-log）右名字；当前回合时发光+呼吸 */}
        <div className={`player-info${isCurrentTurn ? " player-info--current-turn" : ""}`}>
          <div className="player-info-avatar" aria-hidden>
            {(player.nickname || '?').charAt(0).toUpperCase()}
          </div>
          <div className="player-info-main">
            <span className="player-nickname">{player.nickname}</span>
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
    </div>
  )
}
