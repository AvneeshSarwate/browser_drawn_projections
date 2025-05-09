


order of refactors
- create clips on demand for parsed slice definitions
- refactor slice definitions to allow arbitrary function calling (how deep? allow chaning transforms?)
- add references in slice definitions to live slider values - figure out whether to have them be dedicated params for functions or standalone vars that are refrenced (and allow them to be scaled in expressions?)

clipName : seg 1 : s_tr 1 : str 1 : q 1

seg - segment - segment of clip based on marker note
s_tr - scaleTranspose - transposition of clip 
str - timeStretch - stretch factor of clip
q - endTimeQuantize - quantize factor of clip



refactor the text based syntax to define a pipeline of transformations

clipName : seg 1 : s_tr 1 : str 1 : q 1

commands will be separated by :
the first command will be the name of the clip to transform
the rest of the commands will be the transformations to apply to the clip

for each transform command, the first parameter will be the symbol for the transform, and the remaining parameters will be the parameters for the transform.

In the parsing function, there will be a map from the symbol to the actual transform function - for example

seg - segment - segment of clip based on marker note
s_tr - scaleTranspose - transposition of clip 
str - timeStretch - stretch factor of clip
q - endTimeQuantize - quantize factor of clip

For each transform command, the function will take the previous clip as the first parameter, and the remaining parameters will be the parameters for the transform command.



debug1 : seg 1 : s_tr 1 : str 1 : q 1
debug1 : seg 1 : s_tr 2 : str 1 : q 1
debug1 : seg 1 : s_tr 3 : str 1 : q 1
