<template>
  <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
    <!-- Tab bar + download button -->
    <div class="row items-center no-wrap" style="flex-shrink: 0;">
      <q-tabs
        v-model="activeTab"
        dense
        class="text-grey col"
        active-color="primary"
        indicator-color="primary"
        align="left"
        narrow-indicator
      >
        <q-tab
          v-for="doc in docs"
          :key="doc.id"
          :name="doc.id"
          :label="doc.label"
        />
      </q-tabs>
      <q-btn
        flat dense
        icon="download"
        :label="activeDoc?.filename"
        color="primary"
        class="q-mr-sm"
        @click="downloadActive"
      />
    </div>

    <q-separator style="flex-shrink: 0;" />

    <q-tab-panels v-model="activeTab" animated style="flex: 1; overflow: hidden;">
      <q-tab-panel
        v-for="doc in docs"
        :key="doc.id"
        :name="doc.id"
        class="q-pa-none"
        style="height: 100%; overflow-y: auto;"
      >
        <div class="doc-content q-pa-lg" v-html="doc.html" />
      </q-tab-panel>
    </q-tab-panels>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { marked } from 'marked';

defineOptions({ name: 'DocumentationView' });

// Automatically picks up all .md files from docs/ – just add a file and it appears as a new tab
const rawModules = import.meta.globEager('../../docs/*.md') as Record<string, { default: string }>;

interface DocTab {
  id: string;
  label: string;
  filename: string;
  raw: string;
  html: string;
}

function filenameToLabel(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

const docs: DocTab[] = Object.entries(rawModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, module]) => {
    const filename = path.split('/').pop() ?? path;
    const id = filename.replace(/\.md$/i, '');
    const label = filenameToLabel(id);
    const raw = module.default;
    return { id, label, filename, raw, html: marked.parse(raw) as string };
  });

const activeTab = ref(docs[0]?.id ?? '');

const activeDoc = computed(() => docs.find(d => d.id === activeTab.value));

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadActive() {
  if (activeDoc.value) {
    downloadMarkdown(activeDoc.value.raw, activeDoc.value.filename);
  }
}
</script>

<style scoped>
.doc-content {
  max-width: 860px;
  line-height: 1.7;
  overflow: auto;
}

.doc-content :deep(h1) {
  font-size: 1.6rem;
  font-weight: 700;
  margin: 1.2rem 0 0.6rem;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 0.3rem;
}

.doc-content :deep(h2) {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 1.4rem 0 0.5rem;
  border-bottom: 1px solid #eeeeee;
  padding-bottom: 0.2rem;
}

.doc-content :deep(h3) {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 1.1rem 0 0.4rem;
  color: #424242;
}

.doc-content :deep(p) {
  margin: 0.5rem 0;
}

.doc-content :deep(ul),
.doc-content :deep(ol) {
  padding-left: 1.5rem;
  margin: 0.4rem 0;
}

.doc-content :deep(li) {
  margin: 0.2rem 0;
}

.doc-content :deep(code) {
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 3px;
  padding: 0.1em 0.35em;
  font-size: 0.88em;
  font-family: 'Fira Code', 'Consolas', monospace;
}

.doc-content :deep(pre) {
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 0.9rem 1.1rem;
  overflow-x: auto;
  margin: 0.7rem 0;
}

.doc-content :deep(pre code) {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 0.87em;
}

.doc-content :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.7rem 0;
  font-size: 0.93em;
}

.doc-content :deep(th) {
  background: #eeeeee;
  border: 1px solid #bdbdbd;
  padding: 0.4rem 0.7rem;
  text-align: left;
  font-weight: 600;
}

.doc-content :deep(td) {
  border: 1px solid #e0e0e0;
  padding: 0.35rem 0.7rem;
}

.doc-content :deep(tr:nth-child(even) td) {
  background: #fafafa;
}

.doc-content :deep(blockquote) {
  border-left: 4px solid #1976d2;
  margin: 0.6rem 0;
  padding: 0.4rem 0.9rem;
  background: #e3f2fd;
  border-radius: 0 4px 4px 0;
  color: #333;
}

.doc-content :deep(a) {
  color: #1976d2;
  text-decoration: none;
}

.doc-content :deep(a:hover) {
  text-decoration: underline;
}

.doc-content :deep(hr) {
  border: none;
  border-top: 1px solid #e0e0e0;
  margin: 1.2rem 0;
}
</style>
