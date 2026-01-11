While none of the libraries in this project depend on any particular UI framework, all of the sketches currently use Vue for scafolding, and each sketch is wrapped into a single vue component (with several some components). We currently have a particular sketch structure set up to allow for easy tinkering and experimentation while defining most of the custom parts of a sketch all in a single file. 

Reading the Vue documentation is a good place to start. 


The entrypoint to look at is the `SketchWrapper.html`. It is the component that initializes the sketch state and all of the rest of the components. 

The next place to look is `appState.ts`. This is the file that provides access to the `p5.js` sketch and the `three.js` renderer. In general, the `appState` object is the place to put any state that might need to be accessed between different Vue components, or might need to be persisted between hot-reloads if you are live coding. The `SketchWrapper` component is responsible `provide`ing the state object to the rest of the components. (more info on Vue's `provide` function and state management [here](https://vuejs.org/guide/components/provide-inject))

