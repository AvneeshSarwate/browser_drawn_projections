# notes


## design assumptions to remember
- first line of DSL is the clip line
- transforming text never changes its line structure


## UI additions
- when slider is changed, if you're in visualize mode and have a DSL line selected, update the piano roll
- when you click on a DSL line, you can click segmented into the line to see progressive transformations








parameter ramping syntax
debug1 : seg 1 : s_tr 1 : str 1 : q 1
=> p1 0.5 0.8
debug1 : seg 1 : s_tr 2 : str 1 : q 1
=> p1 0.5 0.8
=> p3 0.6 0.7
debug1 : seg 1 : s_tr 3 : str 1 : q 1


splits into 


[
	`debug1 : seg 1 : s_tr 1 : str 1 : q 1
	=> p1 0.5 0.8`,

	`debug1 : seg 1 : s_tr 2 : str 1 : q 1
	=> p1 0.5 0.8
	=> p3 0.6 0.7`

	`debug1 : seg 1 : s_tr 3 : str 1 : q 1`
]








debug1 : seg 1 : s_tr 1 : str 1 : q 1
debug1 : seg 1 : s_tr 2 : str 1 : q 1
debug1 : seg 1 : s_tr 3 : str 1 : q 1


melody2 : transpose 1 
melody3 : transpose s1 


==============
voice 1
debug1 : seg s3 : transpose 1 : transpose 12 : str s4
debug1 : seg s3 : transpose s1 : transpose 12 : str s5
debug1 : seg s3 : transpose 2 : transpose 12 : str s4
debug1 : seg s3 : transpose s1 : transpose 12 : str s5


voice 2
debug1 : seg 0 : str s2 : transpose 1 : transpose -12
debug1 : seg 0 : str 1.1 : transpose s1 : transpose -12
debug1 : seg 0 : str s2 : transpose 2 : transpose -12
debug1 : seg 0 : str 1.1 : transpose s1 : transpose -12
==============

voice 1
debug1 : seg 1 : acc 0 : s_tr s1
debug1 : seg 1 : acc 1 : s_tr s1
debug1 : seg 1 : acc 2 : s_tr s1
debug1 : seg 1 : acc 3 : s_tr s1

debug1 : seg 1 : acc 0 : tr -12
debug1 : seg 1 : acc 0 : tr -12 : rev : str 2 : s_tr 1 
debug1 : seg 1 : acc 1 : tr -12
debug1 : seg 1 : acc 1 : tr -12 : rev : str 2 : s_tr 1 
debug1 : seg 1 : acc 2 : tr -12
debug1 : seg 1 : acc 2 : tr -12 : rev : str 2 : s_tr 1 
debug1 : seg 1 : acc 3 : tr -12
debug1 : seg 1 : acc 3 : tr -12 : rev : str 2 : s_tr 1 

voice 2
debug1 : seg 1 : acc 3 : s_tr 2 : s_tr s2
debug1 : seg 1 : acc 0 : s_tr 2 : s_tr s2
debug1 : seg 1 : acc 1 : s_tr 2 : s_tr s2
debug1 : seg 1 : acc 2 : s_tr 2 : s_tr s2

debug1 : seg 1 : acc 3 : s_tr 2 : str 0.5
debug1 : seg 1 : acc 0 : s_tr 3 : str 0.5
debug1 : seg 1 : acc 1 : s_tr 4 : str 0.5
debug1 : seg 1 : acc 2 : s_tr 5 : str 0.5

==============




## idea for a general format for combining linear + interactive composition
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






## using javascript instead of custom scripting

define a javascript function that returns a string of tracker lines

write scripts that get wrapped in a new Function() call and then evaluated.
if you want to use slider values for logic, use sliders[n] - this will be passed into the function args.
also provides a line() function that can be used to add lines to the tracker output.

example 

if(sliders[0] > 0.5) {
 await line("seg 1 : s_tr 1 : str 1 : q 1")
} else {
 await line("seg 1 : s_tr 1 : str 2 : q 1")
}

if you have an await, then this is an actual playback function, and you kind of lose the ability to forward render the score.
- you could try to realtime render the conditionals (wrap conditionals in some function and eval it and replace with the value?)

if you don't have an await, then you can forward render the score, but then it's tricky to determine realtime playhead position with conditionals



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


