require('dotenv').config();
const { handler } = require('./index.js');
const fs = require('fs');

// Read the test event
const testEvent = JSON.parse(fs.readFileSync('./test-event.json', 'utf8'));

// Mock context object
const context = {
    functionName: 'test-local',
    memoryLimitInMB: '2048',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-local',
    awsRequestId: 'test-request-id'
};

// Run the handler
handler(testEvent, context)
    .then(result => {
        console.log('Success:', result);
    })
    .catch(error => {
        console.error('Error:', error);
    }); 