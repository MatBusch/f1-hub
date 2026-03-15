const PIXELS = [
  "0000001100000000",
  "0000011110000000",
  "0000112211100000",
  "0011222222111000",
  "1111223322211110",
  "0111113333111110",
  "0000113333110000",
  "0001110001110000",
  "0011000000011000",
] as const;

const COLORS: Record<string, string> = {
  "0": "transparent",
  "1": "var(--foreground)",
  "2": "var(--primary)",
  "3": "var(--panel)",
};

export function PixelF1Car() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-[2px] rounded-sm border border-[var(--border-strong)] bg-[var(--background)] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
    >
      {PIXELS.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-[2px]"
          style={{
            gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
          }}
        >
          {row.split("").map((cell, cellIndex) => (
            <span
              key={`${rowIndex}-${cellIndex}`}
              className="size-2.5"
              style={{ backgroundColor: COLORS[cell] }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
