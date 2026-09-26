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

  if (
    lines.length < 2 ||
    lines[0].toLowerCase() !== 'district,site_name,state'
  ) {
    return [];
  }

  return lines
    .slice(1)
    .map(parseCsvLine)
    .filter(row => row.length >= 3 && row[0] && row[1] && row[2])
    .map(([district, siteName, state]) => ({
      district,
      siteName,
      state
    }));
}

function removeDuplicateSites(sites) {
  const seen = new Set();
  const uniqueSites = [];

  for (const site of sites) {
    const key = [
      site.district.trim().toLowerCase(),
      site.siteName.trim().toLowerCase(),
      site.state.trim().toLowerCase()
    ].join('|');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueSites.push(site);
  }

  return uniqueSites;
}

async function importSites(client) {
  const dataDir = path.join(projectRoot, 'data');

  const files = fs.readdirSync(dataDir)
    .filter(file => file.toLowerCase().endsWith('.csv'));

  let imported = 0;
  let duplicatesSkipped = 0;

  const BATCH_SIZE = 100;

  for (const file of files) {
    const sites = readSiteCsv(path.join(dataDir, file));

    const uniqueSites = removeDuplicateSites(sites);

    duplicatesSkipped += sites.length - uniqueSites.length;

    console.log(
      `Reading ${file}: ${sites.length} rows, ${uniqueSites.length} unique`
    );

    for (let start = 0; start < uniqueSites.length; start += BATCH_SIZE) {
      const batch = uniqueSites.slice(start, start + BATCH_SIZE);

      const values = [];
      const placeholders = [];

      batch.forEach((site, index) => {
        const offset = index * 3;

        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3})`
        );

        values.push(
          site.district,
          site.siteName,
          site.state
        );
      });

      await client.query(
        `INSERT INTO cultural_sites
          (district, site_name, state)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (LOWER(district), LOWER(site_name), LOWER(state))
         DO UPDATE SET
           district = EXCLUDED.district`,
        values
      );

      imported += batch.length;
    }
  }

  console.log(`Duplicate site rows skipped: ${duplicatesSkipped}`);

  return imported;
}

function removeDuplicateQuestions(questions) {
  const seen = new Set();
  const uniqueQuestions = [];

  for (const question of questions) {
    const key = [
      question.state.trim().toLowerCase(),
      question.question.trim().toLowerCase()
    ].join('|');

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueQuestions.push(question);
  }

  return uniqueQuestions;
}

async function importQuiz(client) {
  const quizPath = path.join(
    projectRoot,
    'indian_states_culture_heritage_quiz.json'
  );

  const questions = JSON.parse(
    fs.readFileSync(quizPath, 'utf8')
  );

  const validQuestions = questions.filter(
    question =>
      question.state &&
      question.question &&
      Array.isArray(question.options) &&
      question.answer !== undefined
  );

  const uniqueQuestions = removeDuplicateQuestions(validQuestions);

  console.log(
    `Quiz questions: ${validQuestions.length} valid, ${uniqueQuestions.length} unique`
  );

  let imported = 0;
  const duplicatesSkipped =
    validQuestions.length - uniqueQuestions.length;

  const BATCH_SIZE = 100;

  for (
    let start = 0;
    start < uniqueQuestions.length;
    start += BATCH_SIZE
  ) {
    const batch = uniqueQuestions.slice(
      start,
      start + BATCH_SIZE
    );

    const values = [];
    const placeholders = [];

    batch.forEach((question, index) => {
      const offset = index * 5;

      placeholders.push(
        `(
          $${offset + 1},
          $${offset + 2},
          $${offset + 3}::jsonb,
          $${offset + 4},
          $${offset + 5}
        )`
      );

      values.push(
        question.state.trim(),
        question.question.trim(),
        JSON.stringify(question.options),
        String(question.answer),
        question.explanation || ''
      );
    });

    await client.query(
      `INSERT INTO quiz_questions
        (state, question, options, answer, explanation)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (state, question)
       DO UPDATE SET
         options = EXCLUDED.options,
         answer = EXCLUDED.answer,
         explanation = EXCLUDED.explanation`,
      values
    );

    imported += batch.length;
  }

  console.log(`Duplicate quiz questions skipped: ${duplicatesSkipped}`);

  return imported;
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Starting cultural site import...');

    const sites = await importSites(client);

    console.log(
      `Cultural site import complete: ${sites} rows`
    );

    console.log('Starting quiz import...');

    const questions = await importQuiz(client);

    console.log(
      `Quiz import complete: ${questions} questions`
    );

    await client.query('COMMIT');

    console.log(
      `Imported ${sites} cultural site rows and ${questions} quiz questions.`
    );
  } catch (error) {
    await client.query('ROLLBACK');

    console.error(
      'Data import failed:',
      error.message
    );

    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch(error => {
    console.error(
      'Data import failed:',
      error.message
    );

    process.exitCode = 1;
  })
  .finally(() => pool.end());