<script lang="ts">
import NavPage from '/@/lib/NavPage.svelte';
import { studioClient } from '/@/utils/client';
import Tab from '/@/lib/Tab.svelte';
import Route from '/@/Route.svelte';
import Card from '/@/lib/Card.svelte';
import MarkdownRenderer from '/@/lib/markdown/MarkdownRenderer.svelte';
import Fa from 'svelte-fa';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { faDownload, faRefresh } from '@fortawesome/free-solid-svg-icons';
import TasksProgress from '/@/lib/progress/TasksProgress.svelte';
import Button from '/@/lib/button/Button.svelte';
import { getDisplayName } from '/@/utils/versionControlUtils';
import { getIcon } from '/@/utils/categoriesUtils';
import RecipeModels from './RecipeModels.svelte';
import { catalog } from '/@/stores/catalog';
  import { recipes } from '/@/stores/recipe';

export let recipeId: string;

// The recipe model provided
$: recipe = $catalog.recipes.find(r => r.id === recipeId);
$: categories = $catalog.categories;
$: recipeStatus = $recipes.get(recipeId);

let loading: boolean = false;
const onPullingRequest = async () => {
  loading = true;
  await studioClient.pullApplication(recipeId);
}

const onClickRepository = () => {
  if (recipe) {
    studioClient.openURL(recipe.repository);
  }  
}
</script>

<NavPage title="{recipe?.name || ''}" icon="{getIcon(recipe?.icon)}" searchEnabled="{false}">
  <svelte:fragment slot="tabs">
    <Tab title="Summary" url="{recipeId}" />
    <Tab title="Models" url="{recipeId}/models" />
  </svelte:fragment>
  <svelte:fragment slot="content">
    <Route path="/" breadcrumb="Summary" >
      <div class="flex flex-row w-full">
        <div class="flex-grow p-5">
          <MarkdownRenderer source="{recipe?.readme}"/>
        </div>
        <!-- Right column -->
        <div class="border-l border-l-charcoal-400 px-5 max-w-80 min-w-80">
          <Card classes="bg-charcoal-800 mt-5">
            <div slot="content" class="text-base font-normal p-2">
              <div class="text-base mb-2">Repository</div>
              <div class="cursor-pointer flex text-nowrap items-center">
                <Fa size="20" icon="{faGithub}"/>
                <div class="ml-2">
                  <a on:click={onClickRepository}>{getDisplayName(recipe?.repository)}</a>
                </div>
              </div>
            </div>
          </Card>
          {#if recipeStatus !== undefined && recipeStatus.tasks.length > 0}
            <Card classes="bg-charcoal-800 mt-4">
              <div slot="content" class="text-base font-normal p-2">
                <div class="text-base mb-2">Repository</div>
                <TasksProgress tasks="{recipeStatus.tasks}"/>
                {#if recipeStatus.state === 'error'}
                  <Button
                    disabled="{loading}"
                    inProgress="{loading}"
                    on:click={() => onPullingRequest()}
                    class="w-full mt-4 p-2"
                    icon="{faRefresh}"
                  >Retry</Button>
                {/if}
              </div>
            </Card>
          {:else}
            <Button
              on:click={() => onPullingRequest()}
              disabled="{loading}"
              inProgress="{loading}"
              class="w-full mt-4 p-2"
              icon="{faDownload}"
            >
              {#if loading}Loading{:else}Pull application{/if}
            </Button>
          {/if}
        </div>
      </div>
    </Route>
    <Route path="/models" breadcrumb="History">
      <RecipeModels modelsIds={recipe?.models} />
    </Route>
  </svelte:fragment>
  <svelte:fragment slot="subtitle">
    <div class="mt-2">
      {#each recipe?.categories || [] as categoryId}
        <Card
          title="{categories.find(category => category.id === categoryId)?.name || '?'}"
          classes="bg-charcoal-800 p-1 text-xs w-fit"
        />
      {/each}
    </div>
  </svelte:fragment>
</NavPage>
