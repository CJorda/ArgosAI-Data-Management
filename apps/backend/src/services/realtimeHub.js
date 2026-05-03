let ioRef = null;

export function setIo(io) {
  ioRef = io;
}

export function getIo() {
  return ioRef;
}

export function tenantRoom(tenantId) {
  return `tenant:${tenantId}`;
}

export function emitToTenant(tenantId, eventName, payload) {
  if (!ioRef) return;
  ioRef.to(tenantRoom(tenantId)).emit(eventName, payload);
}
