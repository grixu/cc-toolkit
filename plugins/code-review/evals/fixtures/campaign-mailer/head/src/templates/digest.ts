import { escapeHtml } from './escape';
import type { CampaignEmail, CampaignEmailInput } from './types';

export type DigestItem = { headline: string; url: string };

export function renderDigest(
  { title, unsubscribe_url }: Pick<CampaignEmailInput, 'title' | 'unsubscribe_url'>,
  items: DigestItem[],
): CampaignEmail {
  const list = items
    .map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.headline)}</a></li>`)
    .join('\n');

  return {
    headers: { 'List-Unsubscribe': `<${unsubscribe_url}>` },
    html: [`<h1>${escapeHtml(title)}</h1>`, `<ul>${list}</ul>`, '<footer>You get this digest every Monday.</footer>'].join('\n'),
  };
}
