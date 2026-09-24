/**
 * Words spelled in fridge magnets: each letter a different bright color with
 * a little tilt and shadow. Colors follow the letter's position, so the same
 * word always looks the same.
 */
const POPS = ["red", "blue", "yellow", "green", "purple", "orange", "pink"] as const;
const TILT = [-4, 2, -1, 3, -3, 1, 0, -2, 4];

export function Magnet({ text, className = "" }: { text: string; className?: string }) {
  let n = 0;
  return (
    <span className={`magnet ${className}`} aria-label={text}>
      {[...text].map((ch, i) => {
        if (ch === " ") return <span key={i} className="magnet-gap" aria-hidden />;
        const k = n++;
        return (
          <span key={i} aria-hidden className="magnet-letter" style={{ color: `var(--pop-${POPS[k % POPS.length]})`, rotate: `${TILT[k % TILT.length]}deg` }}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}
