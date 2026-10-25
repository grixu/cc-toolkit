export type Campaign = { id: string; title: string; locale: string; sendAt: Date; unsubscribeUrl: string };

export function nextSendWindow(campaign: Campaign, now: Date): Date {
  // return the send time when it is still in the future, otherwise now
  return campaign.sendAt > now ? campaign.sendAt : now;
}
