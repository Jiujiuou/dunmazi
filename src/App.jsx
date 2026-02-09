import { useEffect, useState } from 'react'
import { useGameStore } from './stores/gameStore'
import Lobby from './components/Lobby'
import GameRoom from './components/GameRoom'

// 检测是否为「手机竖屏」状态：用于提示用户旋转设备
function useMobilePortrait() {
  const [isMobilePortrait, setIsMobilePortrait] = useState(false)

  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window === 'undefined') return

      const width = window.innerWidth
      const height = window.innerHeight

      // 粗略判断手机/平板：较小的那条边 < 900px
      const isMobile = Math.min(width, height) < 900
      const isPortrait = height >= width

      setIsMobilePortrait(isMobile && isPortrait)
    }

    checkOrientation()

    window.addEventListener('resize', checkOrientation)
    window.addEventListener('orientationchange', checkOrientation)

    return () => {
      window.removeEventListener('resize', checkOrientation)
      window.removeEventListener('orientationchange', checkOrientation)
    }
  }, [])

  return isMobilePortrait
}

function App() {
  const { game, currentPlayer } = useGameStore()
  const isMobilePortrait = useMobilePortrait()

  return (
    <>
      {isMobilePortrait && (
        <div className="mobile-orientation-overlay">
          <div className="mobile-orientation-card">
            <div className="orientation-icon">📱↻</div>
            <h2>建议横屏游玩</h2>
            <p>请将手机旋转到横屏，以获得更好的游戏体验。</p>
          </div>
        </div>
      )}

      {game && currentPlayer ? <GameRoom /> : <Lobby />}
    </>
  )
}

export default App
