export function FirewatchLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="FireWatch"
    >
      {/* Flame icon */}
      <g>
        {/* Outer flame */}
        <path
          d="M10 28 C10 28 5 22 7 15 C8.5 10 12 8 12 8 C12 8 11 13 14 16 C14 16 13 10 17 7 C19 5.5 20 4 20 4 C20 4 19.5 9 22 12 C24 14.5 25 18 23 22 C21.5 25 18 28 10 28 Z"
          fill="hsl(var(--primary))"
          opacity="0.9"
        />
        {/* Inner flame highlight */}
        <path
          d="M13.5 26 C13.5 26 10 22 11.5 17.5 C12.5 14.5 14.5 13 14.5 13 C14.5 13 14 16 16 18 C17 19.2 18 21 16.5 23.5 C15.5 25.2 13.5 26 13.5 26 Z"
          fill="hsl(var(--primary) / 0.4)"
        />
      </g>

      {/* FIREWATCH wordmark */}
      <text
        x="30"
        y="23"
        fontFamily="'Courier New', Courier, monospace"
        fontSize="14"
        fontWeight="700"
        letterSpacing="2"
        fill="hsl(var(--foreground))"
      >
        FIREWATCH
      </text>
    </svg>
  );
}
