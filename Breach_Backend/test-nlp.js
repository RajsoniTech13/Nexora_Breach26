import http from 'http';

// 1. Paste your JWT token here (generated for User ID 11111111-1111-1111-1111-111111111111)
const JWT_TOKEN = 'PASTE_YOUR_TOKEN_HERE';

// 2. The data you want the AI to parse
const data = JSON.stringify({
  text: "Paid 1500 for lunch, split equally with Bob"
});

// 3. The request options, using the hardcoded Group ID from the SQL script
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/groups/99999999-9999-9999-9999-999999999999/nlp/parse',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data), // Safer than data.length for Unicode
    'Authorization': `Bearer ${JWT_TOKEN}`     // Adding the auth token
  }
};

const req = http.request(options, res => {
  console.log(`Status Code: ${res.statusCode}`);
  let responseBody = '';

  res.on('data', chunk => {
    responseBody += chunk;
  });

  res.on('end', () => {
    try {
      // Pretty-print the JSON response so it's easy to read
      const parsedBody = JSON.parse(responseBody);
      console.log('\n--- API Response ---');
      console.log(JSON.stringify(parsedBody, null, 2));
    } catch (e) {
      console.log('Response (Raw):', responseBody);
    }
  });
});

req.on('error', error => {
  console.error('Request Error:', error);
});

req.write(data);
req.end();