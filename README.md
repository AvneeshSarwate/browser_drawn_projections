#### This is a collection of utility libraries for creative coding, with a focus on making audio-visual synchronicity easier to coordinate

The goal is to build several different interoperable utilites rather than a top down framework. Ideally, each utility should be small and independent enough that an end-user can go in and understand the entire codebase and be able to modify it if it doesn't meet their needs. Practically, this leads to the current soft goal of keeping each utility < 1000 lines, and judicisously leveraging established third party libraries to tackle thorny problems in each utility. 

When wrapping an existing library with a utility, we aim to simplyify but not hide the usage of the underlying library. This means that the utility should be a thin wrapper around the library, and the end user should be able to access the underlying library if they need to. This is in contrast to a framework, which may hide the underlying library and provide a new API.

For example, several of the graphics utilities are built on top of three.js, and the end user should be able to access the three.js scene and camera if they need to.

the directory `src/sketches` contains a few examples of how to use the utilities. The overarching site is built using [Vue](https://vuejs.org/). Each sketch is a self-contained example with it's own state management and UI.


#### The utilities so far

##### Sequencing and time

- **TimeContext** - A combination of a Transport abstraction, as well as context for managing structured concurrency. In short, this proivdes a "wait" function that is scheduled along a transport, so you can wait in loops without experiencing transport drift, allowing you to build long runing musical processes that stay in sync. It is inspired by the "strong timing" and wait semantics of the [ChucK](https://chuck.stanford.edu/) programming langauge, as well [Coroutine Contexts](https://kotlinlang.org/docs/coroutine-context-and-dispatchers.html) from the Kotlin language. It a core utility on which many different kinds of musical timing abstractions can be built. See usages of the `launch()` function defined in `src/channels/channel.ts`
- **EventChop** - A re-implementation of [TouchDesigner's EventChop](https://docs.derivative.ca/Event_CHOP). This is an object that manages the lifecycle of launched events and associated metadata with a relatively simple API. Defined in `src/channels/channel.ts`

##### Graphics
- **Three5** - A wrapper around three.js that attempts to give a similar api to p5.js. The goal is to provide a simple way to animate 2D primitives, but also allow them to be styled with custom shaders. Defined in `src/graphics/three5.ts` and `src/graphics/three5Style.ts`
- **ShaderFX** - a format for applying shader passes to a 2D buffer. The goal is to provide workflow analgous to [TOPs](https://derivative.ca/UserGuide/TOP) in TouchDesigner, allowing for the creation of modular, reusable FX with easily modulatbale parameters. The core definition is defined in `src/rendering/shaderFX.ts`. Examples of custom FX deriving from the base classes are defiend in `src/rendering/customFX.ts`. 
- **Shader Instancing** - A utility controlling instances of a geometry using shaders and textures, similar to how [textures can drive instancing](https://derivative.ca/community-post/tutorial/instancing-geometry/62084) in TouchDesigner. Defined in `src/rendering/shaderInstancing.ts`. 

##### Music
- **MPE Synth** - A base class and interface for building MPE-compatible synthesizers. This module takes inspiration from  [Bitwig's PolyGrid](https://www.bitwig.com/the-grid/). The goal is to create a workflow that allows you to define an arbitrary graph of audio nodes, and then provide a utility that lets you use that graph to create a polyphonic MPE-compatible synthesizer without any extra effort. This workflow allows you to separate the sound design work of a custom synthesizer from the voice-management boiler plate. Similar to Bitwig, the vision is to allow you to use the same core tools to define both modular-synth style and traditional VST instrument/effect style workflows. Defined in `src/music/mpeSynth.ts`
- **Scale** - A utility class for manipulating musical scales and chords. Has rudimentary support for patterns that do not conform to 12-EDO tuning and span more than an octave (proper expansions for non-western tunings and scales planned).  Defined in `src/music/scale.ts`






To build for github pages:
- follow steps here https://dev.to/shashannkbawa/deploying-vite-app-to-github-pages-3ane
- rename the `/dist` directory to `/docs` so that you can select it as the github pages directory
- in `/docs/index.html` change the URIs from absolute to relative


To configure for netlify and have vue-router work:
- remeber the _redirects file for netlify https://docs.netlify.com/routing/redirects/
- https://stackoverflow.com/a/53337147