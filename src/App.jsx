import { useEffect } from 'react'
import { useGameStore } from './stores/gameStore'
import Lobby from './components/Lobby'
import GameRoom from './components/GameRoom'

function App() {
  const { game, currentPlayer } = useGameStore()

  // 移动端尝试请求横屏（部分浏览器仅在全屏下生效，失败则静默忽略）
  useEffect(() => {
    if (typeof window === 'undefined' || !window.screen?.orientation?.lock) return
    const isMobile = Math.min(window.innerWidth, window.innerHeight) < 900
    if (!isMobile) return
    window.screen.orientation.lock('landscape').catch(() => {})
  }, [])

  return game && currentPlayer ? <GameRoom /> : <Lobby />
}

export default App
