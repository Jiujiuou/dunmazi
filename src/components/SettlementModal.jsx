import Card from './Card'
import './SettlementModal.css'

// 花色显示配置
const SUIT_DISPLAY = {
  spades: { name: '黑桃', symbol: '♠', color: 'black' },
  hearts: { name: '红桃', symbol: '♥', color: 'red' },
  clubs: { name: '梅花', symbol: '♣', color: 'black' },
  diamonds: { name: '方块', symbol: '♦', color: 'red' }
}

export default function SettlementModal({ 
  players, 
  responses, 
  winnerId,
  scores,
  onNextRound 
}) {
  const winner = players.find(p => p.id === winnerId)
  
  if (!winner || !responses || !scores) {
    return null
  }

  return (
    <div className="settlement-modal-overlay">
      <div className="settlement-modal">
        <div className="settlement-header">
          <h2 className="settlement-title">🎉 本局结算</h2>
          <button className="btn-next-round" onClick={onNextRound}>
            下一局
          </button>
        </div>
        
        <div className="settlement-table">
          <div className="settlement-table-header">
            <div className="col-player">玩家</div>
            <div className="col-hand">手牌</div>
            <div className="col-type">牌型 / 得分</div>
          </div>
          
          {players.map(player => {
            const response = responses[player.id]
            if (!response) return null
            
            const isWinner = player.id === winnerId
            const isMazi = response.is_mazi
            const handScore = response.evaluation?.handScore || 0
            const suit = response.evaluation?.suit
            
            return (
              <div 
                key={player.id} 
                className={`player-row ${isWinner ? 'winner' : ''} ${isMazi ? 'mazi' : ''}`}
              >
                <div className="col-player">
                  <div className="player-name">{player.nickname}</div>
                  {isWinner && <div className="winner-badge-small">👑</div>}
                </div>
                
                <div className="col-hand">
                  <div className="hand-cards">
                    {response.hand_snapshot?.map((card, index) => (
                      <div key={`${card.id}-${index}`} className="card-small">
                        <Card card={card} small />
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="col-type">
                  {suit ? (
                    <div className="flush-info">
                      <span 
                        className={`suit-symbol ${SUIT_DISPLAY[suit]?.color}`}
                      >
                        {SUIT_DISPLAY[suit]?.symbol}
                      </span>
                      <div className="type-details">
                        <div className="hand-score-label">手牌得分 {handScore}</div>
                        <div className={`score-diff ${isMazi ? 'mazi-score' : 'normal-score'}`}>
                          得分 {scores[player.id]}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="no-flush">-</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
