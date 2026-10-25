export type CampaignEmailInput = {
  title: string;
  body: string;
  unsubscribe_url: string;
};

export type CampaignEmail = {
  headers: Record<string, string>;
  html: string;
};
