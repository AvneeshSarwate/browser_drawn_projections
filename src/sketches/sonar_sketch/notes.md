# notes

## bugs
- race-conditions on barriers when looping and in sync
  - need to make it so that 
    1. if you await a barrier whose start time is the same as the current time, you automatically release
      - this is blocked by logical time not being identical across branched loops with the same wait sequences
    2. if you resolve a barrier after a barrier has been waited at the same time, you can go back an release that barrier 
      - need to save references to all await instaces and their wait start time

## todo
- need to have barriers properly released/cancelled when switching between presets


## quick API reference for livecoding
- call funcs like 
  ```javascript
  line(`debug1 : seg 1 : s_tr 2 : str s1 : q s2+s3, somefunc stringArg
      => param1 0.5 0.8
      => param3 0.6 0.7`)
  //s1, s2, s3, sliders, slidders can be used as expressions
  ```
- access global vars like 
  ```javascript
  flags[0]
  oneShot(0)
  ```
- time synchronization barriers like 
  ```javascript 
  startBarrier('name')
  resolveBarrier('name')
  awaitBarrier('name')
  ```
- in globals livecode section, set vars like 
  ```javascript
  flags[0] = false
  oneShots[0] = true
  sliders[0] = 0.5
  //remember sliders are 0-1 - no protection for accidentally setting out of range - might break based on function
  ```
- hotswapp cued usage - toggle it on when you're ready to hotswap and it picks up new code from the start of the function after the current line is finished playing


## randomness + analysis ideas
- use a seedable random number generator, have diff instances per voice, and cache the seed/state at the start of each function call and reset between visualize/play runs
- if all random calls are made with rng, then you can run the function twice, once w/o playback to analyze/visualize, and once to actually play, with same results
  - you'll see visualized lines change per loop


## design assumptions to remember
- first line of DSL is the clip line
- transforming text for visualize mode never changes its line structure

## UI additions
- have some form of help or autocorrect for the dsl (either in editor or just in vue component)
- be able to livecode in some way 
  - just changing the parameters of the dsl lines? not even changing the transforms structure, just the args

state management cleanup suggestions - https://ampcode.com/threads/T-33628815-ed66-462c-b17c-b8d7c8f5d922

## handling infinite loops in line analysis for js code
currently you can do loops like this to allow line-analysis to terminate
```javascript
for(let i = 0; i < 100; i++) {
  if(!flags[1]) break;
  line(`debug1 : seg 1 : s_tr s2 : str s1 : harm s3 : s_tr -1 : str 0.25`)
  line(`debug1 : seg 1 : s_tr s2 : str s1 : harm s3 : s_tr -2 : str 0.25`)
}
```
what would it take to allow while-loops to work properly but also terminate?
- maybe use acorn to rewrite certain types of while loops to allow analysis?
- instead of `flags[i]`, have `flags(i)` function that only returns true ~100 times
  - if nested whiles, could still lead to analysis being slow? 
  - rare to have more than 2 levels of nesting, would still be fast enough?
- convert while statements with flags to if statements using acorn?
  - might not allow for proper analysis and miss cases?









## demo syntax to use in voice 3
```javascript
// JavaScript livecoding with line() function
// Use conditionals and loops around line() calls

const playFirstPattern = true
const playAlternate = false

if (playFirstPattern) {
  line(`debug1 : seg 1 : s_tr 1 : str s1 : q 1
       => param1 0.5 0.8`)
}

line(`debug1 : seg 1 : s_tr 2 : str 1 : q 1
     => param1 0.5 0.8
     => param3 0.6 0.7`)

if (playAlternate) {
  line(`debug1 : seg 1 : s_tr 4 : str 1 : q 1`)
}

line(`debug1 : seg 1 : s_tr 3 : str 1 : q 1`)
```













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


