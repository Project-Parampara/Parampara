const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Set the path to your JSON file
const quizDataPath = path.join(__dirname, '..', 'indian_states_culture_heritage_quiz.json');

let quizData = [];

try {
  const fileContent = fs.readFileSync(quizDataPath, 'utf-8');
  quizData = JSON.parse(fileContent);
  console.log('Quiz data loaded successfully. Total questions:', quizData.length);
} catch (error) {
  console.error('Error loading quiz JSON file:', error.message);
}

// Helper function for more robust state normalization
function normalizeState(str) {
  return str ? str.trim().toLowerCase().replace(/[\s\-&]/g, '') : '';
}

// API route to get quiz questions for a specific state (array structure)
app.get('/api/get-quiz', (req, res) => {
  try {
    let state = req.query.state;
    console.log('Received state parameter:', JSON.stringify(state));
    if (!state || typeof state !== 'string') {
      return res.status(400).json({ success: false, error: "Please provide a valid state parameter" });
    }
    const normState = normalizeState(state);

    // Filter for matching questions by normalized state
    const questions = quizData.filter(
      q => normalizeState(q.state) === normState
    );

    if (questions.length === 0) {
      console.log(`State "${state}" not found in quiz data.`);
      return res.status(404).json({
        success: false,
        error: `Quiz questions not found for state: ${req.query.state}.`
      });
    }

    res.json({ success: true, state, questions, totalQuestions: questions.length });
  } catch (error) {
    console.error('Error in /api/get-quiz:', error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Route to get all available states (unique list)
app.get('/api/get-states', (req, res) => {
  try {
    const states = Array.from(new Set(quizData.map(q => q.state && q.state.trim()))).filter(Boolean);
    res.json({ success: true, states, totalStates: states.length });
  } catch (error) {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Other route handlers unchanged...

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
  console.log("API endpoints:");
  console.log("  - GET /api/get-quiz?state=StateName");
  console.log("  - GET /api/get-states");
});
