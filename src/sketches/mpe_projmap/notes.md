

projection mapping where MPE midi notes animated a region.

animation plan
- ADSR of note (need to manually coordinate with synth) fills in/out some arrangement of circles inside the region
  - example - if quantized grid of region defines "spots" (like with text setting) - ADSR fills in spots with a circle in order (and they get pulled out in order)
- for polyphony notes > regions - can either allow multiple shape sets in a single region, or voice steal
  - if you allow multiple shape sets in a single region, you can't have mpe pressure/timbre controll a post processing effect
    - also need to keep number of shapes in shape set low/sparse enough that multiple shape sets are visible in region
- pitch classes in octave map to a circular color ramp, pitch bends change all colors
- pressure/timbre map to either arrangement effect, indivudal shape effect, or post processing shader effect
  - shape effect can be size, or some kind of "morph" if the individual shapes are defined via splines? (and if the number is low enough for this to visibly be noticeable)
  - cant map to post processing shader if you don't voice steal


concrete animation idea 
- voice stealing
- initial fill arrangement: sparse grid
  - for some given grid step, element rooted on every 2nd column, and skip every 2nd row 
- pressure - warp arrangement - add a rolling simplex noise displacment to each shape 
- timbre - pixelate shader