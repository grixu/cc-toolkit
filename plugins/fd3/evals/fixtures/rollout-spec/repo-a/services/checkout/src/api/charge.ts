export interface ChargeBody {
  orderId: string;
  amountMinor: number;
}

export async function postCharge(body: ChargeBody) {
  return { status: "accepted", orderId: body.orderId };
}
