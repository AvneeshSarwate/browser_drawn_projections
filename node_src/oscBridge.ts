import { WebSocket } from 'ws';
import { Client, Server } from 'node-osc';

// const wss = new WebSocket.Server({ port: 8080 });

// const clients = new Set<WebSocket>()

// wss.on('connection', (ws) => {
//   console.log('Client connected');
//   clients.add(ws)
// });

// wss.on('message', (message) => {
//   const data = JSON.parse(message.toString())
//   client.send(['/oscAddress', data.delayId, data.time, data.rootId])
// })

const client = new Client('127.0.0.1', 57120);
client.send(['/oscAddress', 'test'])

var oscServer = new Server(9002, '0.0.0.0', () => {
  console.log('OSC Server is listening');
});

oscServer.on('message', function (msg) {
  console.log(`Message: ${msg}`);
});