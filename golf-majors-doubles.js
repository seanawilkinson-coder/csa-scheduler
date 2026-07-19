/**
 * Golf Majors Double Bogeys — 2022–2025
 *
 * Aggregates double bogeys (or worse) recorded by the full field
 * across the four major championships post-Covid.
 *
 * Two values are confirmed from published tournament statistics:
 *   - 2024 Masters: 176  (GolfPost / Today's Golfer)
 *   - 2024 Open Championship: 300  (Today's Golfer / R&A)
 *
 * All other values are estimated by fitting a per-round doubles rate
 * to those confirmed data points, using full-field scoring averages
 * published by the PGA Tour, USGA, and R&A. Field-size differences
 * are accounted for (Masters ≈89 players vs 156 for other majors).
 *
 * Scoring average sources:
 *   - Masters 2022 (+1.86), 2023 (+1.01), 2024 (+0.67), 2025 (+0.68) — PGA Tour
 *   - PGA Championship 2022 (+2.33), 2023 (+2.43), 2024 (≈−0.46), 2025 (+1.46) — PGA Tour
 *   - US Open 2022 (≈+3.0), 2023 (+1.38), 2024 (+2.78), 2025 (≈+3.5) — USGA
 *   - The Open 2022 (≈−0.15), 2023 (+1.43), 2024 (≈+2.5), 2025 (≈+1.5) — R&A
 */

const MAJORS_DATA = {
  years: [2022, 2023, 2024, 2025],

  // confirmed: true = sourced from published data; false = estimated
  tournaments: [
    {
      name: 'The Masters',
      shortName: 'Masters',
      color: '#1A7A49',
      data: [
        { year: 2022, venue: 'Augusta National',       winner: 'Scottie Scheffler', winningScore: -10, doubles: 185, confirmed: false },
        { year: 2023, venue: 'Augusta National',       winner: 'Jon Rahm',          winningScore: -12, doubles: 179, confirmed: false },
        { year: 2024, venue: 'Augusta National',       winner: 'Scottie Scheffler', winningScore: -11, doubles: 176, confirmed: true  },
        { year: 2025, venue: 'Augusta National',       winner: 'Rory McIlroy',      winningScore: -11, doubles: 177, confirmed: false },
      ],
    },
    {
      name: 'PGA Championship',
      shortName: 'PGA',
      color: '#1C5AB5',
      data: [
        { year: 2022, venue: 'Southern Hills CC',      winner: 'Justin Thomas',       winningScore:  -5, doubles: 280, confirmed: false },
        { year: 2023, venue: 'Oak Hill CC',            winner: 'Brooks Koepka',       winningScore:  -9, doubles: 285, confirmed: false },
        { year: 2024, venue: 'Valhalla GC',            winner: 'Xander Schauffele',   winningScore: -21, doubles: 195, confirmed: false },
        { year: 2025, venue: 'Quail Hollow Club',      winner: 'Scottie Scheffler',   winningScore: -11, doubles: 225, confirmed: false },
      ],
    },
    {
      name: 'US Open',
      shortName: 'US Open',
      color: '#C63038',
      data: [
        { year: 2022, venue: 'The Country Club, Brookline', winner: 'Matt Fitzpatrick',    winningScore:  -6, doubles: 308, confirmed: false },
        { year: 2023, venue: 'Los Angeles CC (North)',      winner: 'Wyndham Clark',       winningScore: -10, doubles: 260, confirmed: false },
        { year: 2024, venue: 'Pinehurst No.2',              winner: 'Bryson DeChambeau',   winningScore:  -6, doubles: 319, confirmed: false },
        { year: 2025, venue: 'Oakmont CC',                  winner: 'TBC',                 winningScore: null, doubles: 355, confirmed: false },
      ],
    },
    {
      name: 'The Open Championship',
      shortName: 'The Open',
      color: '#B8860E',
      data: [
        { year: 2022, venue: 'St Andrews (Old Course)',   winner: 'Cameron Smith',       winningScore: -20, doubles: 115, confirmed: false },
        { year: 2023, venue: 'Royal Liverpool (Hoylake)', winner: 'Brian Harman',        winningScore: -13, doubles: 240, confirmed: false },
        { year: 2024, venue: 'Royal Troon',               winner: 'Xander Schauffele',   winningScore:  -9, doubles: 300, confirmed: true  },
        { year: 2025, venue: 'Royal Portrush',            winner: 'Scottie Scheffler',   winningScore: null, doubles: 265, confirmed: false },
      ],
    },
  ],
};

/**
 * Returns summary statistics across all years for a given major.
 */
function majorSummary(tournament) {
  const vals = tournament.data.map(d => d.doubles);
  return {
    name: tournament.name,
    avg:  Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    min:  Math.min(...vals),
    max:  Math.max(...vals),
    range: Math.max(...vals) - Math.min(...vals),
  };
}

/**
 * Returns the most dramatic single championship in the dataset
 * (highest doubles count).
 */
function mostPunishing() {
  let best = null;
  for (const t of MAJORS_DATA.tournaments) {
    for (const d of t.data) {
      if (!best || d.doubles > best.doubles) {
        best = { major: t.name, ...d };
      }
    }
  }
  return best;
}

/**
 * Returns the most benign single championship (fewest doubles).
 */
function mostBenign() {
  let best = null;
  for (const t of MAJORS_DATA.tournaments) {
    for (const d of t.data) {
      if (!best || d.doubles < best.doubles) {
        best = { major: t.name, ...d };
      }
    }
  }
  return best;
}

if (require.main === module) {
  console.log('\n=== Golf Majors Double Bogeys — 2022–2025 ===\n');
  MAJORS_DATA.tournaments.forEach(t => {
    const s = majorSummary(t);
    console.log(`${s.name.padEnd(24)} avg: ${String(s.avg).padStart(3)}  range: ${s.min}–${s.max}  (±${s.range})`);
  });
  const p = mostPunishing();
  const b = mostBenign();
  console.log(`\nMost doubles : ${p.major} ${p.year} @ ${p.venue} — ${p.doubles}${p.confirmed?' ★':''}`);
  console.log(`Fewest doubles: ${b.major} ${b.year} @ ${b.venue} — ${b.doubles}${b.confirmed?' ★':''}`);
  console.log('\n★ = confirmed from published tournament statistics');
}

module.exports = { MAJORS_DATA, majorSummary, mostPunishing, mostBenign };
