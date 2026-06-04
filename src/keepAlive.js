const http = require('http');

function startKeepAlive() {
    const PORT = process.env.PORT || 3000;

    http.createServer((req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/plain'
        });

        res.end('FlameBot Online');
    }).listen(PORT, () => {
        console.log(`Web server on port ${PORT}`);
    });
}

module.exports = {
    startKeepAlive
};
