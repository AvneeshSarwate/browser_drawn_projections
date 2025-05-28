debug1 : seg 1 : s_tr 1 : str 1 : q 1
debug1 : seg 1 : s_tr 2 : str 1 : q 1
debug1 : seg 1 : s_tr 3 : str 1 : q 1


melody2 : transpose 1 
melody3 : transpose s1 



each "scene" is sequencing text - parameters explicit for happy path - but user can take over (optional slider takeovers defined)
different base-clips/functions/parameters in each scene (sliders get re-mapped)
scenes have a cannonical order but listener can take over and move how they want

/**
 * connect functions to their sounded realites 
 * - reduction - connection to an urgnecy leading somehwere - 
 * - or additive stuff - 
 * 
 * candence or stasis - how do you use this to build to moments 
 */

is there away to pass in the clip as an argument to slider scaling or arg parsing? e.g, the time scale function or invert, it would be nice to be able to have sliders map to "clip relative" values (eg, for slice, 0-1 is clip duration, or invert, the axis 0-1 is 3x the range of the clip midi (with the middle third being inside the clip))






## adding functions

The transform-tracker notation system is good for taking small bits and composing them into larger phrases, and at some point it would be nice to be able to define “functions”  - a set of lines that can be all applied together

could look like:

func(arg1 arg2 arg3)
  arg1 : seg 1
  specificClipName : s_tr 1
  specificClipName : s_tr s1      // can still refer to sliders in a func
  arg1 : seg 1 : s_tr arg2
  arg1 : seg 1 : s_tr arg2 : arg3
end

"func" would be a reserved word in the tracker notation

since everything is just strings, args can be used for any "part" of the notation, clip names, argument values, or function names.

in the tracker window, a function would be called like

debug1 : seg 1 : s_tr 1 : str 1 : q 1
func arg1 arg2 s2 : s_tr1              // can pass sliders as args to a func
debug1 : seg 1 : s_tr 3 : str 1 : q 1

funcs still get expanded + compiled on the fly, and follow similar rules for playhead display - starting point, you only see the function line, but could optionally just see the expanded out part? 

in the UI, functions can be defined in a separate window


can functions refer to other functions? take other functions as arguments?
- first, no to both
- then, refer to other functions, but not as arguments
- then, why not
- if you want to go down this road, can you just find some way to hack template literals or lambdas or something to make this normal javascript and save on building an interpreter?



## adding conditionals 


