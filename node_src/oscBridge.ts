//bridge between browser and supercolldier for SuperColliderTimeContext


import { WebSocket } from 'ws';
import { Client, Server } from 'node-osc';

const wss = new WebSocket.Server({ port: 57130 });

const clients = new Set<WebSocket>()

wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws)

  ws.on('message', (message) => {
    const data = JSON.parse(message.toString())
    // console.log("osc message send", data)
    client.send(['/t_delay', data.delayId, data.time, data.rootId])
  })
});

const client = new Client('127.0.0.1', 57120);
// client.send(['/t_delay', "did", 4, 1])

var oscServer = new Server(9002, '0.0.0.0', () => {
  console.log('OSC Server is listening');
});

oscServer.on('message', function (msg) {
  const json = JSON.stringify({id: msg[1], time: msg[2]})
  // console.log("json", json)
  clients.forEach(c => c.send(json))
});