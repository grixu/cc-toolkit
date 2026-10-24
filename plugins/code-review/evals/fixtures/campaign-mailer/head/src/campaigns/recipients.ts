export type Recipient = { email: string; optedOut: boolean; bounced: boolean; locale: string };

export function newsletterRecipients(all: Recipient[], locale: string): Recipient[] {
  return all.filter((recipient) => {
    if (recipient.optedOut || recipient.bounced) {
      return false;
    }

    return recipient.locale === locale;
  });
}

export function digestRecipients(all: Recipient[], locale: string): Recipient[] {
  return all.filter((recipient) => {
    if (recipient.optedOut || recipient.bounced) {
      return false;
    }

    return recipient.locale === locale;
  });
}
