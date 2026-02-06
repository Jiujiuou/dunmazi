import "./PlayerPosition.css";

export default function PlayerPosition({ player, position, isCurrentTurn }) {
  if (!player) return null;

  const isHost = player.player_state?.isHost;
  const cardCount = player.hand?.length || 0;

  return (
    <div className={`player-position player-position-${position}`}>
      <div className="player-info-top">
        <span className="player-nickname">{player.nickname}</span>
        {isHost && <span className="host-badge-small">房主</span>}
      </div>

      <div className={`player-cards ${isCurrentTurn ? "current-turn" : ""}`}>
        {Array.from({ length: cardCount }).map((_, index) => (
          <div
            key={index}
            className="card-back"
            style={{ "--index": index }}
          ></div>
        ))}
      </div>
    </div>
  );
}
