//compile with: faust -lang wasm-i src/music/FaustOperatorPrecompiled/operator.dsp -o operator.wasm (optionally -ftz 2 to match FaustIDE cloud compiler output)
//also need to update dsp-meta.ts with the new generated dsp-meta.json

// settings for operator:
//remember to turn off aliasing, interpolation ON, and default on filter in operator
//set tone to 100%
//keep normalized mode to ON (default)

//todo - add velocity sensitivity to modulator envelopes

import("stdfaust.lib");

nHarmonics = 16;  // Change this number to experiment with different numbers of harmonics
modIndex = hslider("ModIndex", 21, 1, 100, 0.1);


t = button("Gate") | checkbox("AOn_hold");
// baseFreq = ba.midikey2hz(hslider("AMidiNote", 60, 1, 127, 1));
baseFreq = hslider("Frequency", 220, 20, 2000, 0.01);
vAmp = hslider("VelocityAmp", 0.7, 0, 1, 0.01);
release = hslider("Release", 0.3, 0, 1, 0.01);
polyGain = hslider("PolyGain", 0.7, 0, 1, 0.01);
modCurve = hslider("ModCurve", 0.5, 0.01, 10, 0.01);
modChainCurve = hslider("ModChainCurve", 1, 0.01, 10, 0.01);
mod2mod = hslider("Mod2Mod", 1, 1, 16, 0.01);

//this part seems correct (testing via 12th harmonic => 1st harmonic in isolation)
harmonicSlope = hslider("HarmonicSlope", 1, 0.01, 10, 0.01);

//still figuring out this part
// (1, 12) harmonics => 1st harmonic still doesn't have enough low end
harmonicSlopeWeight = hslider("HarmonicSlopeWeight", 1, 0.01, 10, 0.01);



harmonic_operator(modulator, ind) = sumSignals
with {
    vg(x) = vgroup("voice_%ind",x);
    modDepthControl = vg(hslider("yMod_depth", 0, 0, 1, 0.01));
    fine = vg(hslider("yFine", 0, 0, 1, 0.001));
    coarse = vg(hslider("yCoarse", 1, 1, 16, 1));
    fMult = fine + coarse;
    multFreq = baseFreq * fMult;
    modMult = (modIndex * multFreq) / ((ind-1)^modChainCurve); //don't need to use modIndex for last operator in chain
    modDepth = (ba.lin2LogGain(modDepthControl)^modCurve) * modMult; //don't need to use modIndex for last operator in chain
    //todo - something about log scaling here doesn't match ableton
    modDepth2 = modDepth / ba.if(ind == 3, mod2mod, 1);

    hGroup(x) = vg(hgroup("zHarmonics",x));
    harmonicLevels = par(i, nHarmonics, hGroup(vslider("h_%i", i==0, 0, 1, 0.01)));
    totalWeight = harmonicLevels :> _;    

    harmonics = par(i, nHarmonics, os.osc((multFreq+modulator) * float(i + 1)) * (i+1)^harmonicSlope); // Generate harmonic frequencies

    weightedSignals = (harmonics, harmonicLevels) : ro.interleave(nHarmonics,2) : par(i,nHarmonics,*); // Make sure signals are properly paired before multiplication
    a2 = vg(hslider("xAttack", 0.03, 0.001, 10, .001));
    d2 = vg(hslider("xDecay", 0.03, 0.001, 10, .001));
    s2 = vg(hslider("xSustain", 0.8, 0, 1, 0.001)); //todo - lin2log this?
    r2 = vg(hslider("xRelease", 0.03, 0.001, 10, .001));
    env2 = en.adsr(a2, d2, s2, r2, t);
    sumSignals = weightedSignals :> _ / totalWeight  * modDepth2 * env2;
};

end_operator(modulator, ind) = sumSignals
with {
    modDepthControl = 1;
    fine = 0;
    coarse = 1;
    fMult = fine + coarse;
    multFreq = baseFreq * fMult;
    modDepth = 1; //don't need to use modIndex for last operator in chain
    //todo - something about log scaling here doesn't match ableton
    harmonicLevels = par(i, nHarmonics, 1/float(i+1)^2);
    totalWeight = harmonicLevels :> _;    

    harmonics = par(i, nHarmonics, os.osc((multFreq+modulator) * float(i + 1))); // Generate harmonic frequencies

    weightedSignals = (harmonics, harmonicLevels) : ro.interleave(nHarmonics,2) : par(i,nHarmonics,*); // Make sure signals are properly paired before multiplication
    a2 = .03;
    d2 = .03;
    s2 = .8;
    r2 = .03;
    env2 = en.adsr(a2, d2, s2, r2, t);
    sumSignals = weightedSignals :> _ / totalWeight  * modDepth  * env2;
};


// v2 = harmonic_operator(0, 2);
v1 = end_operator(0, 1);


outSignal = v1 * vAmp * polyGain;



process = outSignal, outSignal;