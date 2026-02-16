import { useGameStore } from '../../stores/gameStore'
import { RESPONSE_STATUS } from '../../constants/gameConfig'
import './ShowdownBanner.css'

export default function ShowdownBanner() {
  const { 
    game, 
    players,
    getKnockerInfo,
    getCurrentResponder,
  } = useGameStore()
  
  if (!game || game.status !== 'showdown') return null
  
  const knocker = getKnockerInfo()
  const currentResponder = getCurrentResponder()
  const responses = game.game_state?.showdown_responses || {}
  
  // 统计响应状态
  const respondedPlayers = players.filter(p => 
    responses[p.id] && responses[p.id].action !== 'knock'
  )
  const waitingPlayers = players.filter(p => 
    !responses[p.id] && p.id !== knocker?.id
  )
  
  return (
    <div className="showdown-banner" role="status" aria-live="polite">
      <div className="banner-header">
        <span className="knocker-name">{knocker?.nickname}</span>
        <span className="banner-text">扣牌了，等待其他玩家响应</span>
      </div>
      
      <div className="response-status">
        {currentResponder && (
          <div className="current-responder">
            <span className="label">当前响应</span>
            <span className="player-name highlight">{currentResponder.nickname}</span>
            <span className="waiting-dot" aria-hidden="true" />
          </div>
        )}
        
        {respondedPlayers.length > 0 && (
          <div className="responded-list">
            <span className="label">已响应</span>
            {respondedPlayers.map(p => {
              const response = responses[p.id]
              return (
                <span key={p.id} className="responded-item">
                  {p.nickname}
                  {response.action === 'fold' ? ' 随' : ' 砸'}
                </span>
              )
            })}
          </div>
        )}
        
        {waitingPlayers.length > 0 && (
          <div className="waiting-list">
            <span className="label">未响应</span>
            {waitingPlayers.map(p => (
              <span key={p.id} className="waiting-item">{p.nickname}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
