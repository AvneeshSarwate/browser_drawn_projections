27.1 Arpeggiator
The Arpeggiator Effect.

Arpeggiator creates rhythmical patterns using the notes of a chord or a single note. It offers a complete set of both standard and unique arpeggiator features.

Arpeggiators are a classic element in 80s synth music. The name originates from the musical concept of the arpeggio, in which the notes comprising a chord are played as a series rather than in unison. “Arpeggio” is derived from the Italian word “arpeggiare,” which refers to playing notes on a harp.

The Style chooser determines the sequence of notes in the rhythmical pattern. When a style is selected, a visualization of the pattern is shown in the display. You can use the Previous Style Pattern and Next Style Pattern buttons in the display to cycle through patterns.

Most style patterns are common to standard arpeggiators, such as Up, Down, Converge, and Diverge. There are also a couple of unique patterns:

    Play Order arranges notes in the pattern according to the order in which they are played. This pattern is therefore only recognizable when more than one chord or note has been played.
    Chord Trigger repeats the incoming notes as a block chord.

Additionally, there are three patterns for random arpeggios:

    Random generates a continuously randomized sequence of incoming MIDI notes.
    Random Other generates random patterns from incoming MIDI notes, but will not repeat a given note until all other incoming notes have been used.
    Random Once generates one random pattern from incoming MIDI notes and repeats that pattern until the incoming MIDI changes, at which point a new pattern is created.

The arpeggiated pattern plays at the speed set by the Rate control, which uses either milliseconds or tempo-synced beat divisions, depending on which Sync/Free Rate toggle is selected.

You can transpose the pattern using the Distance and Steps controls. The Distance control sets the transposition in semitones or scale degrees, while the Steps control determines how many times the pattern is transposed. The pattern initially plays at its original pitch and then repeats at progressively higher transpositions when using positive Distance values or lower transpositions when using negative values. For example, when Distance is set to +12 st and Steps is set to 2, a pattern starting with C3 will play first at C3, then C4, and finally at C5.

To transpose the pattern within a specified scale, use the Root and Scale choosers to select your desired settings. You can also transpose the pattern based on the clip’s scale by enabling the Use Current Scale toggle in the device title bar. When this option is enabled, the Root and Scale choosers are deactivated as these settings are determined by the clip.

The Gate control determines the length of the notes in the pattern as a percentage of the Rate value. Gate values above 100% result in notes that overlap, creating a legato effect.

When playing notes using a MIDI controller, you can enable the Hold switch to keep the pattern playing even after releasing the keys. The pattern will continue to repeat until another key is pressed. You can hold an initial set of keys and then press additional keys to add notes to a currently held pattern. To remove notes, play them a second time. This allows you to create a gradual buildup and rearrangement of the pattern over time.

The Pattern Offset control shifts the sequence of notes in the pattern by a specified number of steps. Imagine the pattern as a circle of notes that is played in a clockwise direction from a set start point — Pattern Offset effectively rotates this circle counterclockwise one note at a time, shifting the starting note. For example, if the offset is set to 1, the second note in the pattern plays first and the original first note plays last.

You can add swing to the pattern by selecting a groove from the Groove chooser. Grooves in Arpeggiator function similarly to grooves in clips. The intensity of the groove is determined by the Global Groove Amount slider in the Groove Pool or the Control Bar.

The pattern can be restarted at specific intervals depending on the selected Retrigger option:

    Off — The pattern is never retriggered.
    Note — The pattern is retriggered when a new note is played.
    Beat — The pattern is retriggered on a specified bar or beat, as set by the Interval control.

The LED next to the Retrigger controls flashes each time the pattern is retriggered.

The Repeats control specifies how many times the pattern is repeated. By default, Repeats is set to ∞ so that the pattern plays indefinitely. Setting Repeats to 1 or 2 can emulate the strumming of a guitar, for example. You can also combine different Repeats values with various Retrigger settings to create rhythmically generated arpeggios with pauses in between.

You can enable the Velocity toggle to access the velocity controls for the pattern. Decay sets the time required to reach the velocity value specified by the Target control. For example, using a long Decay time and setting Target to 0 produces a gradual fade-out.

When the Retrigger switch is enabled, the velocity slope is retriggered each time the pattern is retriggered. Combining velocity and Beat retriggering adds rhythmic variation to the pattern’s velocity slope.
