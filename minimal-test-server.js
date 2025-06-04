const express = require('express');
const app = express();
const PORT = 3000;

// Basic middleware
app.use(express.json());

// Simple test route
app.get('/', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// Your register route
app.post('/register', (req, res) => {
  res.json({ message: 'Register endpoint working!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Minimal server running on port ${PORT}`);
});