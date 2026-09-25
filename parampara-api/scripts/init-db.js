const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('PostgreSQL schema is ready.');
}

main()
  .catch(error => {
    console.error('Database initialization failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
