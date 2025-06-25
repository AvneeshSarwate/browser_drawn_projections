//bridge between browser and supercolldier for SuperColliderTimeContext


import { WebSocket } from 'ws';
import { Client, Server } from 'node-osc';

const wss = new WebSocket.Server({ port: 57130 });

const wsClients = new Set<WebSocket>()

const oscClientMap = new Map<number, Client>()

const scOSCClient = new Client('127.0.0.1', 57120);
wss.on('connection', (ws) => {
  console.log('Client connected');
  wsClients.add(ws)

  ws.on('message', (message) => {
    const data = JSON.parse(message.toString())
    // console.log("osc message send", data)
    if(data.delayId && data.time && data.rootId) {
      scOSCClient.send(['/t_delay', data.delayId, data.time, data.rootId])
    }

    if (data.type === 'new_osc_client') {
      if (oscClientMap.has(data.id)) {
        console.log('osc client already exists', data.id)
      } else {
        const client = new Client(data.host, data.port)
        oscClientMap.set(data.id, client)
      }
    }

    if (data.type === 'synth_param_osc') {
      const { instrumentPath, voiceInd, paramInd, value, portNum }: { instrumentPath: string, voiceInd: number, paramInd: number, value: number, portNum: number } = data
      const client = oscClientMap.get(portNum)
      if (client) {
        client.send([instrumentPath, voiceInd, paramInd, value])
      } else {
        console.log('osc client not found', portNum)
      }
    }
  })
});


// client.send(['/t_delay', "did", 4, 1])

const oscServer = new Server(9002, '0.0.0.0', () => {
  console.log('OSC Server is listening');
});

oscServer.on('message', function (msg) {
  const json = JSON.stringify({id: msg[1], time: msg[2]})
  // console.log("json", json)
  wsClients.forEach(c => c.send(json))
});