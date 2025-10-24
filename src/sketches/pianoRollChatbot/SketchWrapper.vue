<script setup lang="ts">
import PianoRollDemo from './components/PianoRollDemo.vue'
</script>

<template>
  <main class="page">
    <h1>LLM MIDI Mangler</h1>
    <div class="description">
      <p>
        This is an LLM powered MIDI mangling workbench. A central piano roll lets you manually write out MIDI, 
        and it is played back using <a href="https://tonejs.github.io/" target="_blank" rel="noreferrer">Tone.js</a>. 
        A chatbot powered by Claude Sonnet can read and write from the piano roll with tool calls. Additionally, 
        there is a workbench at the bottom of the page that lets you define custom functions for transforming 
        the piano roll. The chatbot can write new functions into specific slots, or can even call your functions 
        as tools (instead of generating raw MIDI as an LLM response). You can also manually apply your transformation functions with the controls under the text editor.
        <br/><br/>
        The source code for this is on <a href="https://github.com/AvneeshSarwate/pianoRollChatbot" target="_blank" rel="noreferrer">GitHub</a>.
      </p>
    </div>
    
    <PianoRollDemo />
  </main>
</template>

<style>
@import './style.css';
</style>

<style scoped>
.description {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4) var(--space-5);
  margin: var(--space-5) 0;
  box-shadow: var(--shadow-1);
}

.description p {
  margin: 0;
  font-size: var(--fs-body-2);
  line-height: 1.8;
  color: var(--text);
}
</style>
