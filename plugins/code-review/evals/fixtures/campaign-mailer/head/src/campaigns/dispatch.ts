import { renderDigest, type DigestItem } from '../templates/digest';
import type { CampaignEmail } from '../templates/types';
import { digestRecipients, type Recipient } from './recipients';
import { nextSendWindow, type Campaign } from './schedule';
import type { SendLog } from './sender';
import { batchesFor } from './throttle';

export type SendJob = { sendAt: Date; batches: number; recipients: Recipient[]; email: CampaignEmail };

export function planDigest(campaign: Campaign, all: Recipient[], items: DigestItem[], log: SendLog, now: Date): SendJob | null {
  if (log.has(campaign.id)) {
    return null;
  }

  const recipients = digestRecipients(all, campaign.locale);
  const email = renderDigest({ title: campaign.title, unsubscribe_url: campaign.unsubscribeUrl }, items);
  log.record(campaign.id);

  return { sendAt: nextSendWindow(campaign, now), batches: batchesFor(recipients.length), recipients, email };
}
