
for the following haiku, return a json object of the following format

{
  mood: string
  wordAnalysis: {word: string, syllables: number, accentSyllables: number[]}[][]
  pitches: number[]
  lineByLineMoodTransitions: string[]
  colorByLine: {r: number, g: number, b: number}
}

mood - a short description of the overall mood of the haiku 
wordAnalysis - a per-line, per-word analysis of the words in the haiku 
piches - a sequence of 5 midi pitch numbers that captures the mood of the poem
lineByLineMoodTransitions - the emotional arc of the poem by line - short descriptions
colorByLine - a color for the mood of each line, rgb 0-255

ignore any punctuation in the analysis - for the purpose of word groupings, group punctuation with it's previous word

below is the haiku:






A world of dew,
And within every dewdrop
A world of struggle.





====================================================================================
====================================================================================


big podiatrist
power to fix my movement
shaman of science

{
  "mood": "reverent and healing, blending modern medicine with ancient mysticism",
  "wordAnalysis": [
    [
      {
        "word": "big",
        "syllables": 1,
        "accentSyllables": [0]
      },
      {
        "word": "podiatrist",
        "syllables": 4,
        "accentSyllables": [2]
      }
    ],
    [
      {
        "word": "power",
        "syllables": 2,
        "accentSyllables": [0]
      },
      {
        "word": "to",
        "syllables": 1,
        "accentSyllables": []
      },
      {
        "word": "fix",
        "syllables": 1,
        "accentSyllables": [0]
      },
      {
        "word": "my",
        "syllables": 1,
        "accentSyllables": []
      },
      {
        "word": "movement",
        "syllables": 2,
        "accentSyllables": [0]
      }
    ],
    [
      {
        "word": "shaman",
        "syllables": 2,
        "accentSyllables": [0]
      },
      {
        "word": "of",
        "syllables": 1,
        "accentSyllables": []
      },
      {
        "word": "science",
        "syllables": 2,
        "accentSyllables": [0]
      }
    ]
  ],
  "pitches": [60, 64, 67, 65, 62]
}





====================================================================================
====================================================================================



An old silent pond
A frog jumps into the pond—
Splash! Silence again.

{
  "mood": "Tranquil and contemplative, with a sudden interruption followed by a return to stillness",
  "wordAnalysis": [
    [
      {
        "word": "An",
        "syllables": 1,
        "accentSyllables": [0]
      },
      {
        "word": "old",
        "syllables": 1,
        "accentSyllables": [0]
      },
      {
        "word": "silent",
        "syllables": 2,
        "accentSyllables": [0]
      },
      {
        "word": "pond",
        "syllables": 1,
        "accentSyllables": [0]
      }
    ],
    [
      {
        "word": "A",
        "syllables": 1,
        "accentSyllables": [0]
      },
      {
        "word": "frog",
        "syllables": 1,
        "accentSyllables": [0]
      },
      {
        "word": "jumps",
        "syllables": 1,
        "accentSyllables": [0]
      },
      {
        "word": "into",
        "syllables": 2,
        "accentSyllables": [0]
      },
      {
        "word": "the",
        "syllables": 1,
        "accentSyllables": [0]
      },
      {
        "word": "pond—",
        "syllables": 1,
        "accentSyllables": [0]
      }
    ],
    [
      {
        "word": "Splash!",
        "syllables": 1,
        "accentSyllables": [0]
      },
      {
        "word": "Silence",
        "syllables": 2,
        "accentSyllables": [0]
      },
      {
        "word": "again.",
        "syllables": 2,
        "accentSyllables": [1]
      }
    ]
  ],
  "pitches": [69, 67, 65, 72, 60]
}
