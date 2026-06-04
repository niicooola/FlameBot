const http = require('http');
const { PORT } = require('./config');

function startKeepAlive() {
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('FlameBot is online');
    }).listen(PORT, () => {
        console.log(`🌐 Web server running on port ${PORT}`);
    });
}

module.exports = { startKeepAlive };
