<script lang="ts">
import SvelteMarkdown from 'svelte-markdown'
import LinkComponent from '/@/lib/markdown/LinkComponent.svelte';
export let source: string | undefined;
</script>

<article class="prose min-w-full">
  <SvelteMarkdown {source} renderers="{{link: LinkComponent}}" />
</article>

