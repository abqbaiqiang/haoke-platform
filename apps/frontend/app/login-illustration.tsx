/**
 * 登录页品牌插画：等距（isometric）悬浮毛玻璃看板。
 *
 * 纯装饰，不含任何真实经营数据：所有图表刻意不标注数值，避免被误读为业务数字。
 * 画法：先在一个"平面坐标系"里像画 UI 稿一样摆好所有面板（主窗口 / 侧栏 / 折线 / 柱状 / 浮窗 / 标签），
 * 再用一个 2×3 矩阵把整块平面压成向后倾的等距面；文字也一并进矩阵，
 * 字形因此跟着面板一起倾斜、轻微压扁——与参考稿一致。
 */
const M = { a: 0.9744, b: -0.225, c: 0.055, d: 0.72, tx: 73, ty: 177 };
const PLANE = `matrix(${M.a} ${M.b} ${M.c} ${M.d} ${M.tx} ${M.ty})`;

/** 侧栏导航条：只有左边两角是圆的，右侧与内容区齐平 */
const RAIL_PATH = "M14 0 H48 V200 H14 A14 14 0 0 1 0 186 V14 A14 14 0 0 1 14 0 Z";

/** 侧栏 4 枚图标（白色线性，画在 30×30 方块的正中） */
const RAIL_ICONS = [
  ["M-6 0l6-5 6 5", "M-3.5 -0.5v5h7v-5"],                        // 首页
  ["M-5 5v-6", "M0 5v-10", "M5 5v-3.5"],                          // 图表
  ["M-5 -5h10v10h-10z"],                                          // 方框
  ["M-4.5 -6h9v12h-9z", "M-2 -1.5h4", "M-2 1.5h4"],               // 文档
];

const BARS_X = [266, 292, 318, 344];
const BARS_H = [46, 68, 54, 86];
const CHIP_A_BARS = [
  { x: 126, h: 22, fill: "#bcd6f5" },
  { x: 144, h: 32, fill: "#8fbcf2" },
  { x: 162, h: 42, fill: "#5b8ff0" },
];
const PIE = { cx: 476, cy: 147, r: 19 };

export default function LoginIllustration() {
  return (
    <svg className="login-art" viewBox="10 14 606 410" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="经营看板示意图">
      <defs>
        <linearGradient id="laGlass" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.74" />
          <stop offset="1" stopColor="#dbe7f7" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="laGlassSoft" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.48" />
          <stop offset="1" stopColor="#e2ecf9" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id="laRail" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#b6c9e3" />
          <stop offset="1" stopColor="#87a3c9" />
        </linearGradient>
        <linearGradient id="laPlate" x1="0" y1="0" x2="0.22" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="1" stopColor="#cfe0f5" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="laSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="laBar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7aa8ec" />
          <stop offset="1" stopColor="#dbe7f8" />
        </linearGradient>
        <clipPath id="laClipWin"><rect x="0" y="0" width="234" height="200" rx="14" /></clipPath>
        <clipPath id="laClipBar"><rect x="246" y="44" width="134" height="156" rx="13" /></clipPath>
        <filter id="laBlur" x="-50%" y="-65%" width="200%" height="230%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
        <filter id="laGround" x="-25%" y="-80%" width="150%" height="300%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="laPanel" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#2c4a78" floodOpacity="0.1" />
        </filter>
        <filter id="laChip" x="-40%" y="-55%" width="180%" height="230%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#26456f" floodOpacity="0.24" />
        </filter>
        <filter id="laSeal" x="-45%" y="-50%" width="190%" height="220%">
          <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#26456f" floodOpacity="0.15" />
        </filter>
      </defs>

      {/* 环境光 */}
      <ellipse cx="290" cy="175" rx="250" ry="145" fill="#e4edfc" filter="url(#laBlur)" opacity="0.95" />
      <ellipse cx="450" cy="305" rx="170" ry="95" fill="#e9f1fc" filter="url(#laBlur)" opacity="0.85" />

      <g transform={PLANE}>
        {/* 地面投影 */}
        <rect x="-26" y="276" width="482" height="42" rx="21" fill="#1e3a8a" opacity="0.11" filter="url(#laGround)" />

        {/* 后景浮窗 */}
        <rect x="258" y="-38" width="150" height="62" rx="12" fill="url(#laGlassSoft)" stroke="#ffffff" strokeOpacity="0.68" />
        <rect x="372" y="-24" width="24" height="7" rx="3.5" fill="#d3dfef" />
        <rect x="380" y="-12" width="16" height="6" rx="3" fill="#e2e9f3" />

        {/* 玻璃底座 */}
        <rect x="-24" y="200" width="466" height="82" rx="20" fill="url(#laPlate)" stroke="#ffffff" strokeOpacity="0.92" strokeWidth="1.4" filter="url(#laPanel)" />

        {/* 主窗口（玻璃） */}
        <rect x="0" y="0" width="234" height="200" rx="14" fill="url(#laGlass)" stroke="#ffffff" strokeOpacity="0.92" strokeWidth="1.3" filter="url(#laPanel)" />
        <g clipPath="url(#laClipWin)">
          <path d="M0 90 L234 28 L234 66 L0 128 Z" fill="url(#laSheen)" />
        </g>

        {/* 侧栏导航条 */}
        <path d={RAIL_PATH} fill="url(#laRail)" />
        {[14, 58, 102, 146].map((ty, i) => (
          <g key={ty} transform={`translate(9 ${ty})`}>
            <rect width="30" height="30" rx="9" fill="#ffffff" fillOpacity="0.92" />
            <g transform="translate(15 15)" fill="none" stroke="#7c99c2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {RAIL_ICONS[i].map(d => <path key={d} d={d} />)}
            </g>
          </g>
        ))}

        {/* 折线内容 */}
        <rect x="70" y="18" width="72" height="9" rx="4.5" fill="#c4d3e7" />
        <rect x="70" y="33" width="44" height="7" rx="3.5" fill="#dae2ee" />
        <path d="M70 158 C98 158 104 114 132 114 C160 114 164 140 188 124 C202 114 204 74 216 64"
          fill="none" stroke="#2563eb" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="70" y="170" width="136" height="9" rx="4.5" fill="#dde5f0" />

        {/* 柱状面板 */}
        <rect x="246" y="44" width="134" height="156" rx="13" fill="url(#laGlass)" stroke="#ffffff" strokeOpacity="0.92" strokeWidth="1.3" filter="url(#laPanel)" />
        <g clipPath="url(#laClipBar)">
          <path d="M246 108 L380 66 L380 94 L246 136 Z" fill="url(#laSheen)" />
        </g>
        <rect x="330" y="58" width="34" height="7" rx="3.5" fill="#cfdaeb" />
        <rect x="340" y="70" width="24" height="6" rx="3" fill="#dee6f1" />
        {BARS_X.map((bx, i) => (
          <rect key={bx} x={bx} y={182 - BARS_H[i]} width="20" height={BARS_H[i]} rx="6" fill="url(#laBar)" />
        ))}

        {/* 品牌印记（落在底座上） */}
        <rect x="236" y="230" width="64" height="64" rx="15" fill="#ffffff" fillOpacity="0.96" filter="url(#laSeal)" />
        <image href="/logo-mark.png" x="247" y="241" width="42" height="42" />

        {/* 悬浮标签：数据驱动 / 精益运营 —— 文字在左、图形在右 */}
        <g filter="url(#laChip)">
          <rect x="24" y="240" width="160" height="62" rx="15" fill="#ffffff" fillOpacity="0.97" />
        </g>
        {CHIP_A_BARS.map(bar => (
          <rect key={bar.x} x={bar.x} y={292 - bar.h} width="12" height={bar.h} rx="4" fill={bar.fill} />
        ))}
        <text x="38" y="266" fontSize="20" fontWeight="600" fill="#25324a">数据驱动</text>
        <text x="38" y="297" fontSize="17" fill="#6b7a92">精益运营</text>

        {/* 悬浮标签：协同高效 / 共创价值 —— 文字在左、图形在右 */}
        <g filter="url(#laChip)">
          <rect x="352" y="118" width="152" height="58" rx="15" fill="#ffffff" fillOpacity="0.97" />
        </g>
        <circle cx={PIE.cx} cy={PIE.cy} r={PIE.r} fill="#cfe0f7" />
        <path
          d={`M${PIE.cx},${PIE.cy} L${PIE.cx},${PIE.cy - PIE.r} A${PIE.r},${PIE.r} 0 0 1 ${(PIE.cx + PIE.r * Math.cos(Math.PI / 3.6)).toFixed(2)},${(PIE.cy + PIE.r * Math.sin(Math.PI / 3.6)).toFixed(2)} Z`}
          fill="#5b8ff0"
        />
        <text x="366" y="141" fontSize="20" fontWeight="600" fill="#25324a">协同高效</text>
        <text x="366" y="170" fontSize="17" fill="#6b7a92">共创价值</text>
      </g>
    </svg>
  );
}
