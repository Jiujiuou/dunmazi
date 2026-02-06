# Assets 文件夹

此文件夹用于存放静态资源文件。

## 📁 文件组织建议

```
assets/
├── images/          # 图片资源
│   ├── cards/      # 扑克牌图片
│   ├── avatars/    # 玩家头像
│   └── icons/      # 图标
├── sounds/          # 音效文件
│   ├── card.mp3    # 出牌音效
│   ├── shuffle.mp3 # 洗牌音效
│   └── win.mp3     # 获胜音效
└── fonts/           # 自定义字体（如需要）
```

## 🎴 扑克牌资源

如果需要使用扑克牌图片：

1. 可以使用开源扑克牌素材
2. 推荐尺寸：240x336 px (标准扑克牌比例 2:3)
3. 命名规范：`{suit}_{rank}.png` 例如：`hearts_A.png`

## 🔊 音效资源

建议的音效格式：
- MP3 或 WAV
- 文件大小 < 100KB
- 采样率：44.1kHz

## 💡 使用方式

在组件中导入资源：

```jsx
import cardImage from '../assets/images/cards/hearts_A.png'
import cardSound from '../assets/sounds/card.mp3'

// 使用图片
<img src={cardImage} alt="Ace of Hearts" />

// 播放音效
const audio = new Audio(cardSound)
audio.play()
```

## 📝 注意事项

- 所有资源文件应该优化大小，确保加载速度
- 使用 WebP 格式可以显著减小图片体积
- 音效文件建议使用压缩格式
- 确保使用的资源有合适的版权许可
