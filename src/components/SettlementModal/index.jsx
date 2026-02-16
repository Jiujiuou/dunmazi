import { useGameStore } from '../../stores/gameStore'
import { SUIT_DISPLAY } from '../../constants/cards'
import Card from '../Card'
import './SettlementModal.css'

export default function SettlementModal({ 
  players, 
  responses, 
  winnerId,
  scores,
  onNextRound 
}) {
  const { game, isGameFullyCompleted } = useGameStore()
  const winner = players.find(p => p.id === winnerId)
  
  if (!winner || !responses || !scores || !game) {
    return null
  }

  const isLastRound = game.current_round >= game.total_rounds
  const currentRound = game.current_round
  const totalRounds = game.total_rounds
  
  // 按总分排序玩家
  const sortedPlayers = [...players].sort((a, b) => {
    return (b.total_score || 0) - (a.total_score || 0)
  })

  return (
    <div className="settlement-modal-overlay">
      <div className="settlement-modal">
        <div className="settlement-header">
          <div className="round-info">
            <h2 className="settlement-title">
              {isLastRound ? '🏆 游戏结束' : '🎉 本局结算'}
            </h2>
            <p className="round-progress">第 {currentRound} / {totalRounds} 局</p>
          </div>
          {!isLastRound && (
            <button className="btn-next-round" onClick={onNextRound}>
              下一局
            </button>
          )}
        </div>
        
        {isLastRound && (
          <div className="final-leaderboard">
            <h3 className="leaderboard-title">总排名</h3>
            <div className="leaderboard-list">
              {sortedPlayers.map((player, index) => {
                const roundScore = scores[player.id] || 0
                const totalScore = player.total_score || 0
                const isFinalWinner = index === 0
                
                return (
                  <div 
                    key={player.id} 
                    className={`leaderboard-row ${isFinalWinner ? 'champion' : ''}`}
                  >
                    <div className="rank">{index + 1}</div>
                    <div className="player-info">
                      <span className="player-name">{player.nickname}</span>
                      {isFinalWinner && <span className="champion-badge">🏆</span>}
                    </div>
                    <div className="score-info">
                      <span className="total-score">{totalScore} 分</span>
                      <span className={`round-score ${roundScore >= 0 ? 'positive' : 'negative'}`}>
                        ({roundScore >= 0 ? '+' : ''}{roundScore})
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        
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
                        className={suit ? `suit-symbol suit-symbol-${suit}` : 'suit-symbol'}
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
