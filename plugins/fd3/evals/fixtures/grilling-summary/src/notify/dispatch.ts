export interface Incident {
  id: string;
  severity: "minor" | "major";
}

const subscribers: string[] = [];

export async function dispatchIncident(incident: Incident): Promise<void> {
  for (const email of subscribers) {
    await sendEmail(email, incident);
  }
}

async function sendEmail(recipient: string, incident: Incident): Promise<boolean> {
  void recipient;
  void incident;
  return true;
}
