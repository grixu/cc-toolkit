export interface Order {
  id: string;
  status: 'pending' | 'paid' | 'shipped';
  totalCents: number;
}
