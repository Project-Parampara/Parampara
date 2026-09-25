const fs = require('fs');
const path = require('path');
const pool = require('../db');

const projectRoot = path.join(__dirname, '..', '..');

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const character = line[i];
    if (character === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function readSiteCsv(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length < 2 || lines[0].toLowerCase() !== 'district,site_name,state') return [];
  return lines.slice(1).map(parseCsvLine)
    .filter(row => row.length >= 3 && row[0] && row[1] && row[2])
    .map(([district, siteName, state]) => ({ district, siteName, state }));
}

async function importSites(client) {
  const dataDir = path.join(projectRoot, 'data');
  const files = fs.readdirSync(dataDir)
    .filter(file => file.toLowerCase().endsWith('.csv'));
  let imported = 0;
  for (const file of files) {
    for (const site of readSiteCsv(path.join(dataDir, file))) {
      await client.query(
        `INSERT INTO cultural_sites (district, site_name, state)
         VALUES ($1, $2, $3)
         ON CONFLICT (LOWER(district), LOWER(site_name), LOWER(state))
         DO UPDATE SET district = EXCLUDED.district`,
        [site.district, site.siteName, site.state]
      );
      imported += 1;
    }
  }
  return imported;
}

async function importQuiz(client) {
  const quizPath = path.join(projectRoot, 'indian_states_culture_heritage_quiz.json');
  const questions = JSON.parse(fs.readFileSync(quizPath, 'utf8'));
  let imported = 0;
  for (const question of questions) {
    if (!question.state || !question.question || !Array.isArray(question.options) || question.answer === undefined) continue;
    await client.query(
      `INSERT INTO quiz_questions (state, question, options, answer, explanation)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (state, question)
       DO UPDATE SET options = EXCLUDED.options, answer = EXCLUDED.answer,
                     explanation = EXCLUDED.explanation`,
      [
        question.state.trim(),
        question.question.trim(),
        JSON.stringify(question.options),
        String(question.answer),
        question.explanation || ''
      ]
    );
    imported += 1;
  }
  return imported;
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sites = await importSites(client);
    const questions = await importQuiz(client);
    await client.query('COMMIT');
    console.log(`Imported ${sites} cultural site rows and ${questions} quiz questions.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch(error => {
    console.error('Data import failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
