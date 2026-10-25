import { escapeHtml } from './escape';
import type { CampaignEmail, CampaignEmailInput } from './types';

export function renderNewsletter({ title, body, unsubscribe_url }: CampaignEmailInput): CampaignEmail {
  return {
    headers: { 'List-Unsubscribe': `<${unsubscribe_url}>` },
    html: [
      `<h1>${escapeHtml(title)}</h1>`,
      body,
      `<footer><a href="${escapeHtml(unsubscribe_url)}">Unsubscribe</a></footer>`,
    ].join('\n'),
  };
}
