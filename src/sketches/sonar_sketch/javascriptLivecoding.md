# stages of refactors
 0. test existing refactor + parameter ramp features
 1. update display text any time slider changes (debounced)
 2. javascript based livecoding
 3. adding conditional flags and visualizing conditions in javascript play-view
 4. think about how actual "livecoding" and hotswap of code will work?
    - idea: on any line, you can specify a `cueOut` parameter, which means that after that line plays, the old code will swap over to the new code. On any SINGLE line, you can also specify a `cueIn` parameter, which means that the new code will be swapped in at that point. This allows structured handoff between the hold code and the new code. There can be multiple `cueOut`s, whichever one is hit first is the one that will swap the code over. There can only be one `cueIn` and this will be statically enforced by the editor. If no cueOut is specified, swap over occurs either after current line, or whole code run (optional toggle). If no cue in is specified, the code will be swapped in at the start of the new code.
    - is there a way to detect that the new code has the "same structure" and do a hotswap where you automatically detect the cueOut/cueIn points and keep running it "in phase"?
    - implmentation of `cueIn` seems relatively straightforwards - like the `startIndex` implementation, you can read some state and just skip play until the `cueIn` point is reached. For `cueOut` it seems a little bit trickier, you might need to do some code generation that, for every line that has a `cueOut`, you return a value of whether to skip after playback or not (depending on whether an external `swapIsCued` state is set), and then inject an `if (swapIsCued) { return; }` after the line. This lets the end user not have to think about explict return statements.


## JavascriptBased livecdoing

This describes a desired set of features to be added to the file src/sketches/sonar_sketch/LivecodeHolder.vue. The parent directory of this app is src/sketches/sonar_sketch. Some relevant information might also be in src/sketches/sonar_sketch/appState.ts.

The goal of this change set is to replace a custom pseudo scripting langauge with a more standard JavaScript based livecoding system to allow for general logic to be expressed more easily. 

The changes to be made are as follows:
- add a function called `runLine` that takes existing lines in the livecoding language and parses them into clips, similar to the existing `buildClipFromLine` function. This should also handle blocks with `=>` style modifier lines. It should wrap existing functions and code for parsing and executing the lines.

so, text that looks like:

```
debug1 : seg 1 : s_tr 1 : str 1 : q 1
=> p1 0.5 0.8
debug1 : seg 1 : s_tr 2 : str 1 : q 1
=> p1 0.5 0.8
=> p3 0.6 0.7
debug1 : seg 1 : s_tr 3 : str 1 : q 1
```

could have conditials added to it, and would be executed in JavaScript as:

(this is the "runtime version" of the code)
```javascript
if(someCondition) {
  await runLine(`debug1 : seg 1 : s_tr 1 : str 1 : q 1
                 => p1 0.5 0.8`, ctx, some_uuid_1)
}
await runLine(`debug1 : seg 1 : s_tr 2 : str 1 : q 1
              => p1 0.5 0.8
              => p3 0.6 0.7`, ctx, some_uuid_2)
await runLine(`debug1 : seg 1 : s_tr 3 : str 1 : q 1`, ctx, some_uuid_3)
```
where ctx is the TimeContext instance from the parent that controls timing.

The text that actually gets written into the editor by the user will be slightly different. it will be 

(this is the "input time version" of the code)
```javascript
if(someCondition) {
  line(`debug1 : seg 1 : s_tr 1 : str 1 : q 1
        => p1 0.5 0.8`)
}
line(`debug1 : seg 1 : s_tr 2 : str 1 : q 1
      => p1 0.5 0.8
      => p3 0.6 0.7`)
line(`debug1 : seg 1 : s_tr 3 : str 1 : q 1`)
```

it will be the run through a preprocessor, where every call to `line` is given a UUID. so it looks like this

(this is the "visualize time version" of the code)
```javascript
if(someCondition) {
  line(`debug1 : seg 1 : s_tr 1 : str 1 : q 1
        => p1 0.5 0.8`, some_uuid_1)
}
line(`debug1 : seg 1 : s_tr 2 : str 1 : q 1
      => p1 0.5 0.8
      => p3 0.6 0.7`, some_uuid_2)
line(`debug1 : seg 1 : s_tr 3 : str 1 : q 1`, some_uuid_3)
```

The preprocessor will then create a map between the UUIDs and the lines of the input code, so that when the `runLine` function is called, it can highlight the line in the editor.

The visualize time code will then be transformed into the runtime version of the code, which is what will finally be executed. It will run in a loop with an outer structure like the existing pseudo scripting language. Use the Function constructor to create the runtime version of the code, so that it can be executed in a controlled environment.

There are 2 different editors, the input time editor. the input time editor is monaco and used for editting the code with full typescript support. the visualzie time editor is codemirror and used for its easy decorator API. Once playback starts, the input time editor is hidden and the visualize time editor is shown.

After the initial code is submitted, the input time version of the code is converted to the visualize time version of the code. 
The visualize time version of the code is then executed, and the UUIDs of the executed lines are used to see which lines will actually execute. The view then switches from the input time editor to the visualize time editor. The lines to be executed are then highlighted in the visualize time editor.

Finally, the runtime version of the code is executed, and as the code is executed, the line currently running is highlighted in the visualize time editor.

To see an example how monaco is integrated into these sketches, see src/sketches/pianoRollLivecoding/LivecodeHolder.vue. 

Search the web for examples of how to use codemirror with decorators.

Write all the changes into src/sketches/sonar_sketch/LivecodeHolder.vue.
Keep code organized, but don't split it up into multiple files. This is a prototype so ideal organization keeps components separated without the headache of refactoring across modules.

When in doubt, use web search to find examples of how to do something. Also, remember that this is UI code, so there is no automated testing to run. 

First, generate an implementation plan for the changes to be made. do no yet. After I approve the plan, then write the code.