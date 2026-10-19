const fs = require('node:fs');
const path = require('node:path');
const request = require('request');

const target = path.join(__dirname, '..', 'fixtures', 'orders.json');

request('https://staging.example.com/api/orders?limit=50', { json: true }, (error, _response, body) => {
  if (error) throw error;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(body, null, 2));
});
