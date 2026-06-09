import { EventEmitter } from "node:events";

import type { DomainEvent } from "./domain-event.js";

const eventEmitter = new EventEmitter();

export function publishEvent(event: DomainEvent) {
  eventEmitter.emit(event.name, event);
}

export function subscribeToEvent<TPayload>(
  name: string,
  listener: (event: DomainEvent<TPayload>) => void,
) {
  eventEmitter.on(name, listener as (event: DomainEvent) => void);
}
