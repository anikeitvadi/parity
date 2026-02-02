import Database from 'better-sqlite3';
import chalk from 'chalk';

const db = new Database('markets.db');
const rows = db.prepare(`
  SELECT opportunity_id, type, platform, market_question,
         net_edge, score, position_size, close_date
  FROM opportunities
  ORDER BY score DESC
`).all() as any[];

console.log(chalk.cyan.bold('\n PREDICTION MARKET EDGE SCANNER\n'));
console.log(chalk.bold(
  'SCORE'.padEnd(8) +
  'MARKET'.padEnd(45) +
  'EDGE'.padStart(8) +
  'TYPE'.padStart(14) +
  'SIZE'.padStart(10)
));
console.log('-'.repeat(85));

for (const row of rows) {
  const scoreColor = row.score >= 7 ? chalk.green : row.score >= 5 ? chalk.yellow : chalk.dim;
  console.log(
    scoreColor(row.score.toFixed(1).padEnd(8)) +
    row.market_question.slice(0, 43).padEnd(45) +
    ((row.net_edge * 100).toFixed(1) + '%').padStart(8) +
    row.type.padStart(14) +
    ('$' + row.position_size).padStart(10)
  );
}

console.log('\n' + chalk.dim(`${rows.length} opportunities found`));
db.close();
