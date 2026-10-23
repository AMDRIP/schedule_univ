import { candidateWorkerHandler } from './candidateWorkerRuntime';

const scope = globalThis as unknown as { onmessage: (event: MessageEvent) => void; postMessage: (message: unknown) => void };
const handle = candidateWorkerHandler(message => scope.postMessage(message));
scope.onmessage = event => handle(event.data);
