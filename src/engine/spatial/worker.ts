/// <reference lib="webworker" />

import { SpatialIndex } from './spatialIndex';
import { SpatialWorkerCommand, SpatialWorkerResponse } from './workerProtocol';

const index = new SpatialIndex();

const post = (message: SpatialWorkerResponse) => {
  self.postMessage(message);
};

self.onmessage = (event: MessageEvent<SpatialWorkerCommand>) => {
  const command = event.data;

  try {
    if (command.type === 'load') {
      index.load(command.payload.items);
      post({ type: 'ack', command: 'load' });
      return;
    }
    if (command.type === 'insert') {
      index.insert(command.payload.item);
      post({ type: 'ack', command: 'insert' });
      return;
    }
    if (command.type === 'remove') {
      index.remove(command.payload.id);
      post({ type: 'ack', command: 'remove' });
      return;
    }
    if (command.type === 'clear') {
      index.clear();
      post({ type: 'ack', command: 'clear' });
      return;
    }
    if (command.type === 'search') {
      const items = index.search(command.payload.query);
      post({ type: 'searchResult', requestId: command.requestId, payload: { items } });
      return;
    }
    if (command.type === 'hitTest') {
      const items = index.hitTest(command.payload.point);
      post({ type: 'hitTestResult', requestId: command.requestId, payload: { items } });
      return;
    }
  } catch (error) {
    post({
      type: 'error',
      requestId: 'requestId' in command ? command.requestId : undefined,
      error: error instanceof Error ? error.message : 'Unknown spatial worker error',
    });
  }
};
