//node typescript file that recievies json over a websocket and parses it


//create web socket server
import { WebSocket } from 'ws';

const wss = new WebSocket.Server({ port: 8080 });

const parseTimes: number[] = [];
const maxSamples = 10;
let numParses = 0;

wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.on('message', (message) => {
    const start = process.hrtime();

    try {
      const data = JSON.parse(message.toString());
      // Handle the parsed data if needed
    } catch (error) {
      console.error('Failed to parse JSON:', error);
    }

    numParses++;

    const end = process.hrtime(start);
    const parseTime = end[0] * 1000 + end[1] / 1000000; // Convert to milliseconds

    parseTimes.push(parseTime);
    if (parseTimes.length > maxSamples) {
      parseTimes.shift();
    }

    const averageParseTime = parseTimes.reduce((a, b) => a + b, 0) / parseTimes.length;
    if(numParses % 10 === 0){
      console.log(`Average parse time over last ${parseTimes.length} samples: ${averageParseTime.toFixed(2)} ms`);
    }
  });
});

