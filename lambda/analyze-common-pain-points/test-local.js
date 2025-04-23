const { handler } = require('./dist/index.js');
const fs = require('fs');

// Load environment variables from .env file
require('dotenv').config();

// Read the test event
const testEvent = JSON.parse(fs.readFileSync('./test-event.json', 'utf8'));

// Run the Lambda function
console.log('Running Lambda function locally...');
handler(testEvent)
  .then(() => {
    console.log('Lambda function completed successfully');
  })
  .catch((error) => {
    console.error('Lambda function failed:', error);
  }); 