/**********************************************************************
 * Copyright (C) 2024 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import {
  provider,
  containerEngine,
  type Webview,
  type ProviderContainerConnection,
  type ImageInfo,
} from '@podman-desktop/api';
import type { LocalModelInfo } from '@shared/src/models/ILocalModelInfo';
import type { ModelResponse } from '@shared/src/models/IModelResponse';

import path from 'node:path';
import * as http from 'node:http';
import { getFreePort } from '../utils/ports';
import type { QueryState } from '@shared/src/models/IPlaygroundQueryState';
import { MSG_NEW_PLAYGROUND_QUERIES_STATE, MSG_PLAYGROUNDS_STATE_UPDATE } from '@shared/Messages';
import type { PlaygroundState, PlaygroundStatus } from '@shared/src/models/IPlaygroundState';

// TODO: this should not be hardcoded
const LOCALAI_IMAGE = 'quay.io/go-skynet/local-ai:v2.5.1';

function findFirstProvider(): ProviderContainerConnection | undefined {
  const engines = provider
    .getContainerConnections()
    .filter(connection => connection.connection.type === 'podman')
    .filter(connection => connection.connection.status() === 'started');
  return engines.length > 0 ? engines[0] : undefined;
}

export class PlayGroundManager {
  private queryIdCounter = 0;

  // Dict modelId => state
  private playgrounds: Map<string, PlaygroundState>;
  private queries: Map<number, QueryState>;

  constructor(private webview: Webview) {
    this.playgrounds = new Map<string, PlaygroundState>();
    this.queries = new Map<number, QueryState>();
  }

  async selectImage(connection: ProviderContainerConnection, image: string): Promise<ImageInfo | undefined> {
    const images = (await containerEngine.listImages()).filter(im => im.RepoTags?.some(tag => tag === image));
    return images.length > 0 ? images[0] : undefined;
  }

  setPlaygroundStatus(modelId: string, status: PlaygroundStatus) {
    return this.updatePlaygroundState(modelId, {
      modelId: modelId,
      ...(this.playgrounds.get(modelId) || {}),
      status: status,
    });
  }

  updatePlaygroundState(modelId: string, state: PlaygroundState) {
    this.playgrounds.set(modelId, state);
    return this.webview.postMessage({
      id: MSG_PLAYGROUNDS_STATE_UPDATE,
      body: this.getPlaygroundsState(),
    });
  }

  async startPlayground(modelId: string, modelPath: string): Promise<string> {
    // TODO(feloy) remove previous query from state?
    if (this.playgrounds.has(modelId)) {
      // TODO: check manually if the contains has a matching state
      switch (this.playgrounds.get(modelId).status) {
        case 'running':
          throw new Error('playground is already running');
        case 'starting':
        case 'stopping':
          throw new Error('playground is transitioning');
        case 'error':
        case 'none':
        case 'stopped':
          break;
      }
    }

    await this.setPlaygroundStatus(modelId, 'starting');

    const connection = findFirstProvider();
    if (!connection) {
      await this.setPlaygroundStatus(modelId, 'error');
      throw new Error('Unable to find an engine to start playground');
    }

    let image = await this.selectImage(connection, LOCALAI_IMAGE);
    if (!image) {
      await containerEngine.pullImage(connection.connection, LOCALAI_IMAGE, () => {});
      image = await this.selectImage(connection, LOCALAI_IMAGE);
      if (!image) {
        await this.setPlaygroundStatus(modelId, 'error');
        throw new Error(`Unable to find ${LOCALAI_IMAGE} image`);
      }
    }

    const freePort = await getFreePort();
    const result = await containerEngine.createContainer(image.engineId, {
      Image: image.Id,
      Detach: true,
      ExposedPorts: { ['' + freePort]: {} },
      HostConfig: {
        AutoRemove: true,
        Mounts: [
          {
            Target: '/models',
            Source: path.dirname(modelPath),
            Type: 'bind',
          },
        ],
        PortBindings: {
          '8080/tcp': [
            {
              HostPort: '' + freePort,
            },
          ],
        },
      },
      Labels: {
        'ia-studio-model': modelId,
      },
      Cmd: ['--models-path', '/models', '--context-size', '700', '--threads', '4'],
    });

    await this.updatePlaygroundState(modelId, {
      container: {
        containerId: result.id,
        port: freePort,
        engineId: image.engineId,
      },
      status: 'running',
      modelId,
    });

    return result.id;
  }

  async stopPlayground(modelId: string): Promise<void> {
    const state = this.playgrounds.get(modelId);
    if (state?.container === undefined) {
      throw new Error('model is not running');
    }
    await this.setPlaygroundStatus(modelId, 'stopping');
    // We do not await since it can take a lot of time
    containerEngine
      .stopContainer(state.container.engineId, state.container.containerId)
      .then(async () => {
        await this.setPlaygroundStatus(modelId, 'stopped');
      })
      .catch(async (error: unknown) => {
        console.error(error);
        await this.setPlaygroundStatus(modelId, 'error');
      });
  }

  async askPlayground(modelInfo: LocalModelInfo, prompt: string): Promise<number> {
    const state = this.playgrounds.get(modelInfo.id);
    if (state?.container === undefined) {
      throw new Error('model is not running');
    }

    const query = {
      id: this.getNextQueryId(),
      modelId: modelInfo.id,
      prompt: prompt,
    } as QueryState;

    const post_data = JSON.stringify({
      model: modelInfo.file,
      prompt: prompt,
      temperature: 0.7,
    });

    const post_options: http.RequestOptions = {
      host: 'localhost',
      port: '' + state.container.port,
      path: '/v1/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const post_req = http.request(post_options, res => {
      res.setEncoding('utf8');
      const chunks = [];
      res.on('data', data => chunks.push(data));
      res.on('end', () => {
        const resBody = chunks.join();
        if (res.headers['content-type'] === 'application/json') {
          const result = JSON.parse(resBody);
          const q = this.queries.get(query.id);
          if (!q) {
            throw new Error('query not found in state');
          }
          q.response = result as ModelResponse;
          this.queries.set(query.id, q);
          this.sendQueriesState().catch((err: unknown) => {
            console.error('playground: unable to send the response to the frontend', err);
          });
        }
      });
    });
    // post the data
    post_req.write(post_data);
    post_req.end();

    this.queries.set(query.id, query);
    await this.sendQueriesState();
    return query.id;
  }

  getNextQueryId() {
    return ++this.queryIdCounter;
  }
  getQueriesState(): QueryState[] {
    return Array.from(this.queries.values());
  }

  getPlaygroundsState(): PlaygroundState[] {
    return Array.from(this.playgrounds.values());
  }

  async sendQueriesState() {
    await this.webview.postMessage({
      id: MSG_NEW_PLAYGROUND_QUERIES_STATE,
      body: this.getQueriesState(),
    });
  }
}
