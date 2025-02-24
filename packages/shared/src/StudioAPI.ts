import type { RecipeStatus } from './models/IRecipeStatus';
import type { ModelInfo } from './models/IModelInfo';
import type { QueryState } from './models/IPlaygroundQueryState';
import type { Catalog } from './models/ICatalog';
import type { PlaygroundState } from './models/IPlaygroundState';

export abstract class StudioAPI {
  abstract ping(): Promise<string>;
  abstract getCatalog(): Promise<Catalog>;
  abstract getPullingStatus(recipeId: string): Promise<RecipeStatus>;
  abstract getPullingStatuses(): Promise<Map<string, RecipeStatus>>;
  abstract pullApplication(recipeId: string): Promise<void>;
  abstract openURL(url: string): Promise<boolean>;
  /**
   * Get the information of models saved locally into the extension's storage directory
   */
  abstract getLocalModels(): Promise<ModelInfo[]>;

  abstract startPlayground(modelId: string): Promise<void>;
  abstract stopPlayground(modelId: string): Promise<void>;
  abstract askPlayground(modelId: string, prompt: string): Promise<number>;
  abstract getPlaygroundQueriesState(): Promise<QueryState[]>;
  abstract getPlaygroundsState(): Promise<PlaygroundState[]>;
}
