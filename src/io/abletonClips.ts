import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8080');

//todo api - consolidate AbletonNote type def with the one in alsParsing.ts
type AbletonNote = { pitch: number, duration: number, velocity: number, position: number } 

export const clipMap = new Map<string, AbletonNote[]>();

ws.on('open', () => {
  console.log('Connected to server');

  ws.send('Hello, server!');
});

ws.on('message', (message: string) => {
  console.log(`Received message from server: ${message}`);
  const mes = JSON.parse(message);
  if (mes.type === 'clipMap') {
    clipMap.clear();
    Object.entries(mes.data).forEach(([key, value]: [string, AbletonNote[]]) => {
      clipMap.set(key, value);
    });
    console.log('clipMap updated');
  }
});

ws.on('close', () => {
  console.log('Disconnected from server');
});