const ws = new WebSocket('ws://localhost:8080');

//todo api - consolidate AbletonNote/Clip type def with the one in alsParsing.ts
export type AbletonNote = { pitch: number, duration: number, velocity: number, position: number } 
export type AbletonClip = { name: string, duration: number, notes: AbletonNote[] }

export const clipMap = new Map<string, AbletonClip>();

ws.onopen = () => {
  console.log('Connected to server');
};

ws.onmessage = (message) => {
  console.log(`Received message from server: ${message.data.slice(0, 100)}`);
  const mes = JSON.parse(message.data);
  if (mes.type === 'clipMap') {
    clipMap.clear();
    Object.entries(mes.data).forEach(([key, value]: [string, AbletonClip]) => {
      clipMap.set(key, value);
    });
    console.log('clipMap updated', clipMap);
  }
};

ws.onclose = () => {
  console.log('Disconnected from server');
};