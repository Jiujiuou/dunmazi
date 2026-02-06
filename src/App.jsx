import { useGameStore } from './stores/gameStore'
import Lobby from './components/Lobby'
import GameRoom from './components/GameRoom'

function App() {
  const { game, currentPlayer } = useGameStore()

  if (game && currentPlayer) {
    return <GameRoom />
  }

  return <Lobby />
}

export default App
