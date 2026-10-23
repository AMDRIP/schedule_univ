import { parentPort } from 'worker_threads';
import { candidateWorkerHandler } from './candidateWorkerRuntime';

parentPort!.on('message', candidateWorkerHandler(message => parentPort!.postMessage(message)));
