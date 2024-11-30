//https://d30pueezughrda.cloudfront.net/campaigns/mpe/mpespec.pdf

(
~delayCount = 0;
~delaysUnfinished = 0;
~activeDelays = Set.new;
~delayIds = Set.new;
~defaultClock = LinkClock.new;
~oscToKotlin = NetAddr("localhost", 9002);
~oscToElsewhere = NetAddr("localhost", 10000);
~printDelays = false;
~latencyShift = 0;

~defaultClock.tempo = 2;

~coroStartTimes = Dictionary.new;

// [addr, delayId, kTime, coroKey]
OSCFunc({|msg, time, addr, recvPort|
	var delayId = msg[1];
	var kTime = msg[2];
	var coroHashCode = msg[3];
	var buffer = 0.01*~defaultClock.tempo;
	// msg.postln;
	// [coroHashCode, ~coroStartTimes[coroHashCode].isNil].postln;



	// ["coroStart t_delay", ~coroStartTimes[coroHashCode], kTime, buffer, schedTime].postln;
	if(kTime == \beat,
		{~defaultClock.sched(~defaultClock.timeToNextBeat, {
			~coroStartTimes[coroHashCode] = ~defaultClock.beats;
			"beat dleay".postln;
			~oscToKotlin.sendMsg("/delay", delayId, ~defaultClock.beats);
		})},
		{
			var schedTime = ~coroStartTimes[coroHashCode] + kTime + buffer - ~latencyShift;

			if(~printDelays, {[~coroStartTimes[coroHashCode], kTime].postln});

			~defaultClock.schedAbs(schedTime, {
				~oscToKotlin.sendMsg("/delay", delayId, ~defaultClock.beats);
			})
		}
	);
}, "/t_delay");

)



~defaultClock.tempo = 2

OSCFunc.trace


~midiOuts.keys.includes("Bus 2".asSymbol)
//Ableton xml bend values are relative to 8192 as "0 bend"
~defaultOut.noteOn(1, 64, 64)
~defaultOut.bend(1, 8192  + 341)
~defaultOut.bend(1, 8192)
~defaultOut.touch(1, 0)
~defaultOut.touch(1, 64)
~defaultOut.noteOff(1, 64, 64)
~defaultOut.latency
~defaultOut.allNotesOff(0)

~delayCount
~activeDelays
~delayIds

~delayIds.includes("d4988982-55a0-4482-8a95-7ed37e254773".asSymbol)
