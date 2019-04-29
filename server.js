let socket_io = require('socket.io');
let Socket = require('./socket');

class Server extends socket_io {
    
    constructor (functions = {}, server) {
        super(server);

        this.on('connection', (sock) => Socket(sock, functions));
    }
    
}

module.exports = Server;