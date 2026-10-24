export type ShipmentStatus = "label_created" | "in_transit" | "delivered" | "exception";

export interface Shipment {
  id: string;
  carrierTrackingId: string;
  status: ShipmentStatus;
  updatedAt: Date;
}

const shipments = new Map<string, Shipment>();

export async function getShipment(id: string): Promise<Shipment | null> {
  return shipments.get(id) ?? null;
}

export async function setStatus(id: string, status: ShipmentStatus): Promise<void> {
  const current = shipments.get(id);
  if (current) shipments.set(id, { ...current, status, updatedAt: new Date() });
}
