# UI 配色系统梳理与优化方案

> 基于 **web-design-guidelines**、**ui-ux-pro-max**、**frontend-design** 等 skills 对当前站点的配色进行审计与优化建议。  
> **References**: Vercel Web Interface Guidelines (accessibility, focus, color consistency); UI/UX Pro Max (color palette, contrast, consistency); Frontend Design (cohesive aesthetic, CSS variables, dominant color + accents).  
> 目标：统一主题色、消除突兀色、建立可维护的 CSS 变量体系。

---

## 一、当前配色系统总览

### 1.1 设计令牌（CSS 变量）— `src/index.css`

| 变量名 | 当前值 | 用途 |
|--------|--------|------|
| `--bg` | `#FAFBFC` | 页面主背景 |
| `--bg-secondary` | `#F1F5F9` | 次级背景、卡片底 |
| `--primary` | `#36454f` | 主色/标题/强调文字 |
| `--secondary` | `#708090` | 次要信息、边框强调 |
| `--cta` | `#6b9080` | 主操作色（按钮、链接、焦点） |
| `--cta-hover` | `#5a7d6f` | CTA 悬停 |
| `--text` | `#36454f` | 正文（与 primary 同色） |
| `--text-muted` | `#64748b` | 辅助文字 |
| `--border` | `#E2E8F0` | 边框、分割线 |
| `--success` | `#059669` | 成功状态 |
| `--success-bg` | `#d1fae5` | 成功背景 |
| `--warning` | `#d97706` | 警告状态 |
| `--warning-bg` | `#fef3c7` | 警告背景 |
| `--error` | `#dc2626` | 错误/危险 |
| `--error-bg` | `#fee2e2` | 错误背景 |
| `--disabled` | `#94a3b8` | 禁用态 |
| `--shadow` | `0 1px 3px rgba(0,0,0,0.08)` | 轻阴影 |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | 中阴影 |

整体风格：**低饱和、灰绿主色**（`--primary` / `--cta`），偏「简洁、淡雅、清新」。

---

### 1.2 各文件中的颜色使用清单

#### 已正确使用 CSS 变量的文件（仅列部分）

- **Lobby.css / GameRoom.css / SettlementModal.css / ScorePanel.css / PlayArea.css / PlayerPosition.css / DeckPile.css / HandInfo.css / ActionLog.css / ChatStrip.css**  
  大量使用 `var(--bg)`、`var(--cta)`、`var(--text)`、`var(--success)`、`var(--warning)`、`var(--error)` 等，与主题一致。

#### 硬编码颜色（需整改）

| 位置 | 颜色 | 说明 |
|------|------|------|
| **src/constants/cards.js** | `#ef4444` | 红桃 — 与主题无关，偏 Tailwind red-500 |
| **src/constants/cards.js** | `#f59e0b` | 方块 — 与 `--warning` 接近但不一致 |
| **src/constants/cards.js** | `#10b981` | 梅花 — 与 `--success` (#059669) 不同绿 |
| **src/constants/cards.js** | `#002fa7` | 黑桃 — **克莱因蓝，高饱和，与整体风格严重冲突** |
| **src/components/Card.jsx** | `#10b981` / `#ef4444` | 大小王符号颜色，与 cards.js 重复且脱离主题 |
| **src/components/GameRoom.css** | `#047857` | success 按钮 hover（约 3 处）— 应使用变量 |
| **src/components/GameRoom.css** | `#b91c1c` | error 按钮 hover — 应使用变量 |

#### 半透明色（建议收敛为变量）

以下为直接写死的 `rgba`，建议统一为「基于主题色的透明变体」：

- **CTA 系**：`rgba(107, 144, 128, 0.06~0.35)` → 对应 `--cta`，出现于 Lobby.css、GameRoom.css、SettlementModal.css、ScorePanel.css、PlayerPosition.css、PlayArea.css、DeckPile.css、ChatStrip.css。
- **Warning 系**：`rgba(217, 119, 6, 0.2~0.4)` → 对应 `--warning`。
- **Error 系**：`rgba(220, 38, 38, 0.3)` → 对应 `--error`。
- **中性**：`rgba(0,0,0,0.03~0.2)`（阴影/遮罩）、`rgba(255,255,255,0.15~0.95)`（浮层/玻璃感）。

---

## 二、问题诊断（对照 Skills）

### 2.1 与 **frontend-design** 的冲突

- **「Commit to a cohesive aesthetic. Use CSS variables for consistency.»**  
  当前：扑克花色和大小王使用 4 种独立高饱和色（红、橙、绿、克莱因蓝），与主色 `--cta`（灰绿）和 `--primary`（深灰）割裂，**没有统一主题色**。
- **「Dominant colors with sharp accents outperform timid, evenly-distributed palettes.»**  
  现状是「主题色 + 多套互不关联的 accent」，导致视觉焦点分散，**突兀感强**的尤其是 `#002fa7` 和 `#ef4444`。

### 2.2 与 **ui-ux-pro-max** 的冲突

- **Typography & Color（MEDIUM）**：应保持 **color palette 一致**，且考虑 **color-contrast（CRITICAL，正文至少 4.5:1）**。  
  克莱因蓝 `#002fa7` 在浅底上对比度过高，与其它柔和色形成「刺眼」对比；红/橙/绿与主题绿并存，语义不清（成功 vs 花色）。
- **Pre-Delivery Checklist**：light mode contrast 4.5:1 minimum；当前部分 `--text-muted` 与 `--disabled` 在浅底上需核验对比度。
- **Consistency**：同一语义（如「成功绿」）出现两套：`--success` (#059669) 与 cards 的 #10b981，**不一致**。

### 2.3 与 **web-design-guidelines** 的关联

- 若未来支持 **Dark Mode**，当前硬编码 hex 难以用 `color-scheme` 与 CSS 变量统一切换。
- **Hover & Interactive States**：hover 需「increase contrast」；当前部分 hover 使用硬编码 `#047857` / `#b91c1c`，未与 `--success` / `--error` 形成统一深浅体系。

### 2.4 小结：主要问题

1. **主题不统一**：花色/王用 4 种独立高饱和色，缺少与 `--primary` / `--cta` 的关联。
2. **突兀色**：`#002fa7`（克莱因蓝）、`#ef4444`（纯红）在淡雅灰绿体系中非常跳。
3. **重复与不一致**：两套绿色（success vs 梅花）、多处 CTA/warning/error 的 rgba 与 hover 硬编码。
4. **可维护性差**：透明色和 hover 未纳入设计令牌，改主题需到处找 hex/rgba。

---

## 三、优化方案

### 3.1 设计原则（对齐 Skills）

- **单一主色体系**：以 `--primary` + `--cta` 为主，其余为语义色（success / warning / error）或中性色。
- **花色与主题融合**：花色用「主题内」的色相或明度区分，避免引入额外色相（如克莱因蓝、纯红）。
- **所有颜色进 CSS 变量**：无散落 hex/rgba，便于换肤与无障碍对比度调整。

### 3.2 扩展 CSS 变量（建议在 `index.css` 中增加）

```css
/* 在 :root 中追加 */

/* 语义色 hover（避免硬编码 #047857 / #b91c1c） */
--success-hover: #047857;
--error-hover: #b91c1c;

/* CTA / Warning / Error 的透明变体（便于 focus、背景、边框统一） */
--cta-alpha-06: rgba(107, 144, 128, 0.06);
--cta-alpha-10: rgba(107, 144, 128, 0.1);
--cta-alpha-12: rgba(107, 144, 128, 0.12);
--cta-alpha-15: rgba(107, 144, 128, 0.15);
--cta-alpha-20: rgba(107, 144, 128, 0.2);
--cta-alpha-30: rgba(107, 144, 128, 0.3);

--warning-alpha-20: rgba(217, 119, 6, 0.2);
--warning-alpha-30: rgba(217, 119, 6, 0.3);
--warning-alpha-40: rgba(217, 119, 6, 0.4);

--error-alpha-30: rgba(220, 38, 38, 0.3);

/* 中性遮罩/阴影（可选） */
--overlay: rgba(0, 0, 0, 0.8);
--overlay-light: rgba(0, 0, 0, 0.03);
--surface-glass: rgba(255, 255, 255, 0.95);
```

之后将全项目中的 `rgba(107, 144, 128, …)`、`rgba(217, 119, 6, …)`、`rgba(220, 38, 38, 0.3)` 以及 `#047857` / `#b91c1c` 替换为以上变量。

### 3.3 花色与大小王配色（与主题统一）

目标：**保留红/黑语义（红桃、方块 vs 黑桃、梅花）**，但色相与明度贴近现有主题，避免刺眼。

| 花色 | 当前 | 建议 | 说明 |
|------|------|------|------|
| 红桃 | `#ef4444` | 使用 `--error` 或 `--suit-red`（见下） | 与错误色区分：可用略偏红的 `--cta` 深色或单独定义 |
| 方块 | `#f59e0b` | 使用 `--warning` | 与警告统一 |
| 梅花 | `#10b981` | 使用 `--success` 或 `--cta` | 与成功/主色统一 |
| 黑桃 | `#002fa7` | 使用 `--primary` 或 `--suit-dark` | 用深灰/深蓝灰替代克莱因蓝 |

**推荐：在 `index.css` 增加「花色专用」变量，便于以后换主题。**

```css
/* 花色（与主题一致，低饱和） */
--suit-red: #b91c1c;      /* 深红，偏沉稳，可替换为 --error */
--suit-orange: #d97706;   /* 与 --warning 一致 */
--suit-green: #059669;    /* 与 --success 一致 */
--suit-dark: #36454f;     /* 与 --primary 一致，黑桃/梅花用深色 */
```

**constants/cards.js** 改为引用 CSS 变量名（在 JS 中通过 `getComputedStyle` 读，或直接改为在 CSS 中通过 class 控制花色颜色，见下）。

**更简洁的做法**：  
- 红桃/方块 → 用同一套「暖色」：例如 `--suit-red: var(--error);`、`--suit-orange: var(--warning);`  
- 梅花/黑桃 → 用「冷色/中性」：`--suit-green: var(--cta);`、`--suit-dark: var(--primary);`  

这样全站只有一套语义色 + 主色，**无额外色相**。

### 3.4 组件层修改清单

| 文件 | 修改内容 |
|------|----------|
| **src/constants/cards.js** | 删除硬编码 hex；改为导出语义 key（如 `suitRed` / `suitOrange` / `suitGreen` / `suitDark`），实际颜色由 CSS 变量 + class 或 data 属性决定；或保留 key 但值改为从 theme 读取（如注入 theme 对象）。 |
| **src/components/Card.jsx** | 大小王颜色不再用 `#10b981` / `#ef4444`；改为 className（如 `joker-small` / `joker-big`），在 Card.css 中用 `var(--suit-green)` / `var(--suit-red)` 或 `var(--cta)` / `var(--error)`。 |
| **src/components/HandInfo.jsx** | 花色展示改为用 class 或 data-suit，颜色由 CSS 控制，避免 `style={{ color: SUIT_DISPLAY[suit]?.color }}` 内联 hex。 |
| **src/components/GameRoom.css** | 所有 `#047857` → `var(--success-hover)`；所有 `#b91c1c` → `var(--error-hover)`；所有 CTA/warning/error 的 rgba → 对应 `--*-alpha-*` 变量。 |
| **Lobby.css / SettlementModal.css / ScorePanel.css / PlayerPosition.css / PlayArea.css / DeckPile.css / ChatStrip.css** | 将 `rgba(107, 144, 128, …)`、`rgba(217, 119, 6, …)`、`rgba(220, 38, 38, 0.3)` 替换为 `index.css` 中新增的变量。 |

### 3.5 可选：花色完全由 CSS 驱动

- 在 **Card.jsx** 中为牌根元素加 `data-suit="hearts"`（或 diamonds/clubs/spades）。
- 在 **Card.css** 中：

```css
.card[data-suit="hearts"] .rank,
.card[data-suit="hearts"] .suit-large { color: var(--suit-red); }
.card[data-suit="diamonds"] .rank,
.card[data-suit="diamonds"] .suit-large { color: var(--suit-orange); }
/* ... clubs → --suit-green, spades → --suit-dark */
```

- **cards.js** 只保留 `name`、`symbol`，不再导出 `color`。  
这样所有花色颜色都来自 `index.css`，**零硬编码**，换主题时只改一处。

---

## 四、实施优先级建议

| 优先级 | 内容 | 预期效果 |
|--------|------|----------|
| P0 | 去掉克莱因蓝 `#002fa7`，改为 `--primary` 或 `--suit-dark` | 消除最突兀色 |
| P0 | GameRoom.css 中 `#047857` / `#b91c1c` 改为变量 | 统一 hover 语义 |
| P1 | index.css 增加 `--success-hover`、`--error-hover` 及 CTA/warning/error 的 alpha 变量 | 可维护性、后续换肤 |
| P1 | 全项目 rgba(107,144,128,…) 等替换为变量 | 风格统一、易改主题 |
| P2 | 花色配色改为主题内色（suit-red/orange/green/dark）并进 CSS | 整体视觉统一 |
| P2 | Card.jsx / HandInfo.jsx 去掉内联 hex，改用 class 或 data-suit + CSS | 零散色归集到设计系统 |

---

## 五、优化后预期效果

- **统一主题色**：全站以灰绿（primary/cta）为主，语义色（success/warning/error）仅用于状态与少量花色，无额外高饱和色。
- **无突兀色**：克莱因蓝、纯红等移除或收敛到主题变量。
- **易维护**：所有颜色来自 `index.css`，换主题/做深色模式只需改变量。
- **符合 Skills**：与 frontend-design（cohesive aesthetic）、ui-ux-pro-max（color consistency）、web-design-guidelines（hover、dark mode 友好）一致。

---

## 六、附录：当前硬编码颜色速查

| 颜色值 | 出现位置 | 建议 |
|--------|----------|------|
| `#ef4444` | cards.js, Card.jsx | → `var(--error)` 或 `var(--suit-red)` |
| `#f59e0b` | cards.js | → `var(--warning)` |
| `#10b981` | cards.js, Card.jsx | → `var(--success)` 或 `var(--cta)` |
| `#002fa7` | cards.js | → `var(--primary)` 或 `var(--suit-dark)` |
| `#047857` | GameRoom.css | → `var(--success-hover)` |
| `#b91c1c` | GameRoom.css | → `var(--error-hover)` |
| `rgba(107,144,128,*)` | 多处 | → `var(--cta-alpha-*)` |
| `rgba(217,119,6,*)` | 多处 | → `var(--warning-alpha-*)` |
| `rgba(220,38,38,0.3)` | 多处 | → `var(--error-alpha-30)` |

---

## 七、实施状态（已落实）

- **P0/P1**：`index.css` 已包含 `--success-hover`、`--error-hover` 及 CTA/warning/error 的 alpha 变量；GameRoom 等处的 hover 与透明色已改为使用变量。
- **P2**：花色由 CSS 驱动。`src/constants/cards.js` 不再导出 `color`；`Card.jsx` 通过 `data-suit` + `Card.css` 中的 `var(--suit-*)` 控制花色颜色，与主题统一。
- 卡牌（含大小王）及 HandInfo 等组件的颜色均使用 `index.css` 中的设计令牌，无散落 hex。

文档结束。后续可在本目录增加「UI-Color-Tokens.md」仅列最终变量表，供开发与设计对照。
