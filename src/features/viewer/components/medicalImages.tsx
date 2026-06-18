export function CTBrainSVG({ brightness }: { brightness: number }) {
  return (
    <svg
      viewBox="-220 -200 440 400"
      style={{
        width: "100%",
        height: "100%",
        filter: `brightness(${brightness})`,
      }}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="-220" y="-200" width="440" height="400" fill="#000" />
      <ellipse
        cx="0"
        cy="0"
        rx="190"
        ry="165"
        fill="#1a1a1a"
        stroke="#d0d0d0"
        strokeWidth="8"
      />
      <ellipse
        cx="0"
        cy="0"
        rx="178"
        ry="153"
        fill="#111"
        stroke="#a0a0a0"
        strokeWidth="3"
      />
      <ellipse cx="0" cy="0" rx="168" ry="143" fill="#5a5a5a" />
      <ellipse cx="0" cy="0" rx="140" ry="120" fill="#787878" />
      <line x1="0" y1="-150" x2="0" y2="150" stroke="#ddd" strokeWidth="2.5" />
      <path
        d="M-50 -10 Q-60 5 -55 25 Q-42 35 -28 28 Q-18 12 -24 -5 Z"
        fill="#1a1a1a"
      />
      <path
        d="M50 -10 Q60 5 55 25 Q42 35 28 28 Q18 12 24 -5 Z"
        fill="#1a1a1a"
      />
      <ellipse cx="-45" cy="35" rx="22" ry="16" fill="#6a6a6a" />
      <ellipse cx="45" cy="35" rx="22" ry="16" fill="#6a6a6a" />
      <ellipse cx="-16" cy="45" rx="16" ry="12" fill="#585858" />
      <ellipse cx="16" cy="45" rx="16" ry="12" fill="#585858" />
      {Array.from({ length: 300 }).map((_, i) => {
        const angle = (i * 137.5 * Math.PI) / 180;
        const r = Math.sqrt(i / 300) * 138;
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle);
        const gray = 80 + Math.floor((i * 31) % 80);
        return (
          <circle
            key={i}
            cx={x.toFixed(1)}
            cy={y.toFixed(1)}
            r="0.9"
            fill={`rgb(${gray},${gray},${gray})`}
            opacity="0.45"
          />
        );
      })}
    </svg>
  );
}

export function ChestXraySVG({ brightness }: { brightness: number }) {
  return (
    <svg
      viewBox="0 0 400 460"
      style={{
        width: "100%",
        height: "100%",
        filter: `brightness(${brightness})`,
      }}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width="400" height="460" fill="#050505" />
      <path
        d="M60 100 Q50 130 55 200 Q58 280 70 320 Q90 350 120 340 Q145 320 148 280 Q150 220 145 160 Q138 110 120 95 Q90 80 60 100 Z"
        fill="#aaa"
        opacity="0.85"
      />
      <path
        d="M340 100 Q350 130 345 200 Q342 280 330 320 Q310 350 280 340 Q255 320 252 280 Q250 220 255 160 Q262 110 280 95 Q310 80 340 100 Z"
        fill="#aaa"
        opacity="0.85"
      />
      <rect x="148" y="90" width="104" height="260" fill="#555" rx="8" />
      <path
        d="M160 160 Q155 200 160 240 Q170 290 200 310 Q230 290 240 240 Q245 200 240 160 Q225 140 200 148 Q175 140 160 160 Z"
        fill="#888"
      />
      <rect
        x="194"
        y="80"
        width="12"
        height="300"
        fill="#ccc"
        rx="3"
        opacity="0.9"
      />
      {[120, 155, 190, 225, 255, 285, 310, 335].map((y, i) => (
        <path
          key={`l${i}`}
          d={`M148 ${y} Q100 ${y - 10} 65 ${y + 15}`}
          fill="none"
          stroke="#ddd"
          strokeWidth="2.5"
          opacity="0.8"
        />
      ))}
      {[120, 155, 190, 225, 255, 285, 310, 335].map((y, i) => (
        <path
          key={`r${i}`}
          d={`M252 ${y} Q300 ${y - 10} 335 ${y + 15}`}
          fill="none"
          stroke="#ddd"
          strokeWidth="2.5"
          opacity="0.8"
        />
      ))}
      <path
        d="M148 95 Q100 75 65 88"
        fill="none"
        stroke="#eee"
        strokeWidth="4"
      />
      <path
        d="M252 95 Q300 75 335 88"
        fill="none"
        stroke="#eee"
        strokeWidth="4"
      />
      <path
        d="M65 340 Q130 360 200 355 Q270 360 335 340"
        fill="none"
        stroke="#ccc"
        strokeWidth="3"
      />
    </svg>
  );
}

export function MRISpineSVG({ brightness }: { brightness: number }) {
  return (
    <svg
      viewBox="0 0 300 500"
      style={{
        width: "100%",
        height: "100%",
        filter: `brightness(${brightness})`,
      }}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width="300" height="500" fill="#050505" />
      <rect x="80" y="40" width="140" height="420" fill="#2a2a2a" rx="20" />
      <rect x="88" y="50" width="42" height="400" fill="#3a3a3a" rx="8" />
      <rect x="170" y="50" width="42" height="400" fill="#3a3a3a" rx="8" />
      {[80, 160, 240, 320, 400].map((y, i) => (
        <g key={i}>
          <rect
            x="120"
            y={y - 30}
            width="60"
            height="48"
            fill="#b0b0b0"
            rx="6"
            style={{ filter: `brightness(${brightness})` }}
          />
          {i < 4 && (
            <rect
              x="122"
              y={y + 18}
              width="56"
              height="18"
              fill={i === 3 ? "#3a3a3a" : "#666"}
              rx="4"
            />
          )}
        </g>
      ))}
      <rect x="146" y="50" width="8" height="400" fill="#111" rx="2" />
      <rect
        x="147"
        y="50"
        width="6"
        height="400"
        fill="#e8e8e8"
        rx="1"
        opacity="0.6"
      />
    </svg>
  );
}

export function UltrasoundSVG({ brightness }: { brightness: number }) {
  return (
    <svg
      viewBox="0 0 400 380"
      style={{
        width: "100%",
        height: "100%",
        filter: `brightness(${brightness})`,
      }}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width="400" height="380" fill="#020808" />
      <path d="M80 20 L320 20 L350 360 L50 360 Z" fill="#0a1a0a" />
      {Array.from({ length: 600 }).map((_, i) => {
        const x = 80 + ((i * 73) % 240);
        const y = 20 + ((i * 97) % 340);
        const b = (i * 37) % 180;
        return (
          <circle
            key={i}
            cx={x.toFixed(1)}
            cy={y.toFixed(1)}
            r={(i % 3) * 0.5 + 0.4}
            fill={`rgb(0,${b},0)`}
            opacity={(i % 5) * 0.15 + 0.2}
          />
        );
      })}
      <ellipse
        cx="180"
        cy="160"
        rx="100"
        ry="70"
        fill="none"
        stroke="#00cc44"
        strokeWidth="1.5"
        opacity="0.7"
      />
      <ellipse
        cx="230"
        cy="200"
        rx="22"
        ry="16"
        fill="#003300"
        stroke="#00aa33"
        strokeWidth="1"
      />
      <text x="130" y="155" fill="#00ff55" fontSize="10" fontFamily="monospace">
        LIVER
      </text>
      <text x="210" y="215" fill="#00ff55" fontSize="9" fontFamily="monospace">
        GB
      </text>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i}>
          <line
            x1="75"
            y1={20 + i * 55}
            x2="82"
            y2={20 + i * 55}
            stroke="#00aa33"
            strokeWidth="0.8"
          />
          <text
            x="60"
            y={24 + i * 55}
            fill="#00aa33"
            fontSize="8"
            fontFamily="monospace"
          >
            {i}cm
          </text>
        </g>
      ))}
    </svg>
  );
}

export function renderImage(modality: string, brightness: number) {
  switch (modality) {
    case "MRI":
      return <MRISpineSVG brightness={brightness} />;
    case "X-RAY":
      return <ChestXraySVG brightness={brightness} />;
    case "ULTRASOUND":
      return <UltrasoundSVG brightness={brightness} />;
    default:
      return <CTBrainSVG brightness={brightness} />;
  }
}