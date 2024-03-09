<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { sketchNames } from '@/router';

</script>

<template>
  <div>Sketches:</div>
  <div id="sketchList">
    <router-link v-for="sketchName in sketchNames" :key="sketchName" :to="`/${sketchName}`">
      <div> {{ sketchName }} </div>
    </router-link>
  </div>
</template>

<style scoped>
#sketchList {
  display: flex;
  flex-direction: column;
  margin-left: 10px;
}
</style>