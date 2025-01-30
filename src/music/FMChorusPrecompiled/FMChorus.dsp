import("stdfaust.lib");

//basic parameters all voices need to have
gate = button("Gate");
freq = hslider("Frequency", 440, 20, 2000, 1);
vAmp = hslider("VelocityAmp", 0.7, 0, 1, 0.01);
release = hslider("Release", 0.3, 0, 1, 0.01);
polyGain = hslider("PolyGain", 0.7, 0, 1, 0.01);



// Parameters
depth = hslider("c_Depth [ms]", 10, 1, 50, 0.1) * ma.SR / 1000.0; // Depth in samples
rate = hslider("c_Rate [Hz]", 0.25, 0.01, 5, 0.01);              // LFO rate
mix = hslider("c_Mix [%]", 50, 0, 100, 1) * 0.01;               // Dry/Wet mix

// LFO for modulation
lfo = os.osc(rate) * depth; // Modulating signal for delay

// Smooth delay with interpolation
chorusEffect(input) = mix * (input : de.sdelay(2 * depth, 128, depth + lfo)) 
                        + (1 - mix) * input;


echoFdbk = hslider("EchoFdbk", 0.3, 0, 1, 0.01);
echoTime = hslider("EchoTime", 0.3, 0.01, 10, 0.01);

detune = hslider("Detune", 1, 0, 50, 0.01);
modRelease = hslider("ModRelease", 0.3, 0, 1, 0.01);

//custom parameters for each voice
filterFreq = hslider("Filter", 3000, 20, 10000, 0.1);

env2 = gate : en.adsr(0.01, 0.1, 0.2, modRelease);
mod0 = (os.osc(freq*3 + 2*detune)*3 + os.osc(freq*5 + 8*detune)*5 + os.osc(freq*7 + 16*detune)*0) * env2;

env = gate : en.adsr(0.01, 0.1, 0.8, release);
filter = fi.lowpass(2, filterFreq);

oscSig = os.osc(freq + mod0 * freq*2);
sig = oscSig  * vAmp * polyGain * env : filter : chorusEffect : ef.echo(10, echoTime, echoFdbk);
process = sig;