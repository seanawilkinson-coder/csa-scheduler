/**
 * Golf Majors Double Bogeys — 2022–2026
 *
 * Tracks double bogeys (or worse) recorded by the full field
 * across the four major championships, 2022 onwards.
 *
 * confirmed: true  = figure sourced from a published post-tournament
 *                    statistical report (R&A, USGA, PGA Tour, or major media)
 * confirmed: false = figure NOT available; doubles is null
 *
 * Confirmed figures:
 *   - 2024 Masters: 176  (Today's Golfer / GolfPost)
 *   - 2024 Open Championship (Royal Troon): 300  (Today's Golfer / R&A)
 */

const MAJORS_DATA = {
  years: [2022, 2023, 2024, 2025, 2026],

  tournaments: [
    {
      name: 'The Masters',
      shortName: 'Masters',
      color: '#1A7A49',
      data: [
        { year: 2022, venue: 'Augusta National',  winner: 'Scottie Scheffler', winningScore: -10, doubles: null, confirmed: false },
        { year: 2023, venue: 'Augusta National',  winner: 'Jon Rahm',          winningScore: -12, doubles: null, confirmed: false },
        { year: 2024, venue: 'Augusta National',  winner: 'Scottie Scheffler', winningScore: -11, doubles: 176,  confirmed: true  },
        { year: 2025, venue: 'Augusta National',  winner: 'Rory McIlroy',      winningScore: -11, doubles: null, confirmed: false },
        { year: 2026, venue: 'Augusta National',  winner: 'Rory McIlroy',      winningScore: -12, doubles: null, confirmed: false },
      ],
    },
    {
      name: 'PGA Championship',
      shortName: 'PGA',
      color: '#1C5AB5',
      data: [
        { year: 2022, venue: 'Southern Hills CC',   winner: 'Justin Thomas',     winningScore:  -5, doubles: null, confirmed: false },
        { year: 2023, venue: 'Oak Hill CC',          winner: 'Brooks Koepka',     winningScore:  -9, doubles: null, confirmed: false },
        { year: 2024, venue: 'Valhalla GC',          winner: 'Xander Schauffele', winningScore: -21, doubles: null, confirmed: false },
        { year: 2025, venue: 'Quail Hollow Club',    winner: 'Scottie Scheffler', winningScore: -11, doubles: null, confirmed: false },
        { year: 2026, venue: 'Aronimink GC',         winner: 'Aaron Rai',         winningScore:  -9, doubles: null, confirmed: false },
      ],
    },
    {
      name: 'US Open',
      shortName: 'US Open',
      color: '#C63038',
      data: [
        { year: 2022, venue: 'The Country Club, Brookline', winner: 'Matt Fitzpatrick',  winningScore:  -6, doubles: null, confirmed: false },
        { year: 2023, venue: 'Los Angeles CC (North)',      winner: 'Wyndham Clark',     winningScore: -10, doubles: null, confirmed: false },
        { year: 2024, venue: 'Pinehurst No. 2',             winner: 'Bryson DeChambeau', winningScore:  -6, doubles: null, confirmed: false },
        { year: 2025, venue: 'Oakmont CC',                  winner: 'J.J. Spaun',        winningScore:  -1, doubles: null, confirmed: false },
        { year: 2026, venue: 'Shinnecock Hills',            winner: 'Wyndham Clark',     winningScore:  -4, doubles: null, confirmed: false },
      ],
    },
    {
      name: 'The Open Championship',
      shortName: 'The Open',
      color: '#B8860E',
      data: [
        { year: 2022, venue: 'St Andrews (Old Course)',    winner: 'Cameron Smith',     winningScore: -20, doubles: null, confirmed: false },
        { year: 2023, venue: 'Royal Liverpool (Hoylake)', winner: 'Brian Harman',      winningScore: -13, doubles: null, confirmed: false },
        { year: 2024, venue: 'Royal Troon',               winner: 'Xander Schauffele', winningScore:  -9, doubles: 300,  confirmed: true  },
        { year: 2025, venue: 'Royal Portrush',            winner: 'Scottie Scheffler', winningScore: -17, doubles: null, confirmed: false },
        { year: 2026, venue: 'Royal Birkdale',            winner: 'Scottie Scheffler', winningScore: -17, doubles: null, confirmed: false },
      ],
    },
  ],
};

/**
 * Returns summary statistics for a major, using only confirmed data points.
 */
function majorSummary(tournament) {
  const confirmed = tournament.data.filter(d => d.confirmed && d.doubles !== null);
  if (!confirmed.length) return { name: tournament.name, avg: null, min: null, max: null, range: null, count: 0 };
  const vals = confirmed.map(d => d.doubles);
  return {
    name:  tournament.name,
    avg:   Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    min:   Math.min(...vals),
    max:   Math.max(...vals),
    range: Math.max(...vals) - Math.min(...vals),
    count: vals.length,
  };
}

/**
 * Returns the confirmed championship with the most double bogeys.
 */
function mostPunishing() {
  let best = null;
  for (const t of MAJORS_DATA.tournaments) {
    for (const d of t.data) {
      if (!d.confirmed || d.doubles === null) continue;
      if (!best || d.doubles > best.doubles) best = { major: t.name, ...d };
    }
  }
  return best;
}

/**
 * Returns the confirmed championship with the fewest double bogeys.
 */
function mostBenign() {
  let best = null;
  for (const t of MAJORS_DATA.tournaments) {
    for (const d of t.data) {
      if (!d.confirmed || d.doubles === null) continue;
      if (!best || d.doubles < best.doubles) best = { major: t.name, ...d };
    }
  }
  return best;
}

if (require.main === module) {
  console.log('\n=== Golf Majors Double Bogeys — 2022–2026 ===\n');
  console.log('Only confirmed figures from published tournament statistics are shown.\n');
  MAJORS_DATA.tournaments.forEach(t => {
    t.data.forEach(d => {
      const tag = d.confirmed ? ' ★' : ' (no confirmed data)';
      const val = d.doubles !== null ? String(d.doubles) : '—';
      console.log(`  ${t.shortName.padEnd(8)} ${d.year}  ${d.venue.padEnd(30)}  ${val.padStart(4)}${tag}`);
    });
  });
  console.log('\n★ = confirmed from published tournament statistics');
}

module.exports = { MAJORS_DATA, majorSummary, mostPunishing, mostBenign };
