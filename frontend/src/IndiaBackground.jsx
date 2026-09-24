import { useEffect, useRef, useState } from 'react';

/*
 * IndiaBackground — a purely decorative Earth-observation backdrop.
 *
 * NOT a map. No Leaflet, no tiles, no network map requests, no animation loop.
 * Just two small static images (day / night) crossfaded with CSS, plus a dark
 * overlay, driven by six IST phases. State is fully local to this component, so
 * the SatQuery app never re-renders because of the clock. One time check/min.
 *
 * Swap the placeholder art anytime by replacing:
 *   public/backgrounds/india-day.webp   (e.g. NASA Blue Marble, India-centred)
 *   public/backgrounds/india-night.webp (e.g. VIIRS City Lights, India-centred)
 */

// Six visual phases from ONE day + ONE night image — differences are CSS only.
const PHASES = [
  //                       night   brightness saturate overlay  warm
  { name: 'DEEP NIGHT', label: 'NIGHT',    night: true,  b: 0.70, s: 1.05, o: 0.62, warm: 0.00 },
  { name: 'DAWN',       label: 'DAWN',     night: false, b: 0.80, s: 0.92, o: 0.50, warm: 0.16 },
  { name: 'MORNING',    label: 'DAYLIGHT', night: false, b: 0.96, s: 1.00, o: 0.42, warm: 0.05 },
  { name: 'MIDDAY',     label: 'DAYLIGHT', night: false, b: 1.08, s: 1.05, o: 0.34, warm: 0.00 },
  { name: 'AFTERNOON',  label: 'DUSK',     night: false, b: 0.90, s: 1.00, o: 0.46, warm: 0.18 },
  { name: 'NIGHT',      label: 'NIGHT',    night: true,  b: 0.72, s: 1.10, o: 0.60, warm: 0.00 },
];

function phaseIndex(dec) {
  if (dec < 5) return 0;        // 00:00–05:00 deep night
  if (dec < 8) return 1;        // 05:00–08:00 dawn
  if (dec < 11.5) return 2;     // 08:00–11:30 morning
  if (dec < 15.5) return 3;     // 11:30–15:30 midday
  if (dec < 19) return 4;       // 15:30–19:00 afternoon / dusk
  return 5;                     // 19:00–24:00 night
}

function istNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const mm = Number(parts.find((p) => p.type === 'minute').value);
  return { h, mm, dec: h + mm / 60 };
}

export default function IndiaBackground() {
  const [{ h, mm }, setClock] = useState(istNow);
  const [idx, setIdx] = useState(() => phaseIndex(istNow().dec));
  const idxRef = useRef(idx);

  // One check per minute. Only touches this component's local state.
  useEffect(() => {
    const tick = () => {
      const t = istNow();
      setClock({ h: t.h, mm: t.mm });
      const next = phaseIndex(t.dec);
      if (next !== idxRef.current) { idxRef.current = next; setIdx(next); }
    };
    const timer = window.setInterval(tick, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const p = PHASES[idx];
  const filt = `brightness(${p.b}) saturate(${p.s})`;
  const hh = String(h).padStart(2, '0');
  const mmm = String(mm).padStart(2, '0');

  return (
    <div className="india-bg" aria-hidden="true">
      <img className="india-bg-img" src="/backgrounds/india-day.webp" alt=""
        draggable="false" style={{ opacity: p.night ? 0 : 1, filter: filt }} />
      <img className="india-bg-img" src="/backgrounds/india-night.webp" alt=""
        draggable="false" loading="lazy" style={{ opacity: p.night ? 1 : 0, filter: filt }} />
      <div className="india-bg-warm" style={{ opacity: p.warm }} />
      <div className="india-bg-overlay" style={{ background: `rgba(5, 10, 14, ${(p.o * 0.28).toFixed(2)})` }} />
      <div className="india-bg-label">INDIA · NOW<br /><b>{hh}:{mmm} IST</b><br />{p.label}</div>
    </div>
  );
}
