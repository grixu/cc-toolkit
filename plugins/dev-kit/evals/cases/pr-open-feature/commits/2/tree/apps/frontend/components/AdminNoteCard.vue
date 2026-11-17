<script setup lang="ts">
import { ref } from 'vue';
import RichTextEditor from './RichTextEditor.vue';
import { useAdminNote } from '../composables/useAdminNote';

const props = defineProps<{ organizationId: string }>();
const { note, save, canWrite } = useAdminNote(props.organizationId);
const editing = ref(false);
</script>

<template>
  <section v-if="note || canWrite" class="admin-note-card">
    <h3>Internal note</h3>
    <RichTextEditor v-if="editing" :model-value="note?.html ?? ''" @save="(html) => { save(html); editing = false; }" />
    <div v-else v-html="note?.html" />
    <button v-if="canWrite && !editing" @click="editing = true">Edit</button>
  </section>
</template>
