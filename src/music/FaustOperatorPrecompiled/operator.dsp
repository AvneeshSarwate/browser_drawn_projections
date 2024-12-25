import("stdfaust.lib");

nHarmonics = 16;  // Change this number to experiment with different numbers of harmonics
modIndex = hslider("ModIndex", 26, 1, 100, 1);


t = button("Gate") | checkbox("AOn_hold");
// baseFreq = ba.midikey2hz(hslider("AMidiNote", 60, 1, 127, 1));
baseFreq = hslider("Frequency", 220, 20, 2000, 0.01);
vAmp = hslider("VelocityAmp", 0.7, 0, 1, 0.01);
release = hslider("Release", 0.3, 0, 1, 0.01);
polyGain = hslider("PolyGain", 0.7, 0, 1, 0.01);


harmonic_operator(modulator, ind, isEnd) = sumSignals
with {
    vg(x) = vgroup("voice_%ind",x);
    modDepthControl = vg(hslider("yMod_depth", ba.if(isEnd, 1, 0), 0, 1, 0.01));
    fine = vg(hslider("yFine", 0, 0, 1, 0.001));
    coarse = vg(hslider("yCoarse", 1, 1, 16, 1));
    fMult = fine + coarse;
    multFreq = baseFreq * fMult;
    modDepth = ba.lin2LogGain(modDepthControl) * ba.if(isEnd, 1, (modIndex * multFreq)); //don't need to use modIndex for last operator in chain

    hGroup(x) = vg(hgroup("zHarmonics",x));
    harmonicLevels = par(i, nHarmonics, hGroup(vslider("h_%i", i==0, 0, 1, 0.01)));
    totalWeight = harmonicLevels :> _;

    harmonics = par(i, nHarmonics, os.osc((multFreq+modulator) * float(i + 1))); // Generate harmonic frequencies

    weightedSignals = (harmonics, harmonicLevels) : ro.interleave(nHarmonics,2) : par(i,nHarmonics,*); // Make sure signals are properly paired before multiplication
    a2 = vg(hslider("xAttack", 0.03, 0.001, 1, .001));
    d2 = vg(hslider("xDecay", 0.03, 0.001, 1, .001));
    s2 = vg(hslider("xSustain", 0.8, 0, 1, 0.001));
    r2 = vg(hslider("xRelease", 0.03, 0.001, 1, .001));
    env2 = en.adsr(a2, d2, s2, r2, t);
    sumSignals = weightedSignals :> _ / ba.if(isEnd, totalWeight, 1) * modDepth * env2; //don't normalize harmonic sum except at last operator - todo - probs need to attentuate sum a bit (sqrt?), but not a ton
};


v4 = harmonic_operator(0, 4, 0);
v3 = harmonic_operator(v4, 3, 0);
v2 = harmonic_operator(v3, 2, 0);
v1 = harmonic_operator(v2, 1, 1);


outSignal = v1 * vAmp * polyGain;



process = outSignal, outSignal;