import { OrderDetail } from "./pages/OrderDetail";

export const routes = [
  { path: "/orders/:orderId", render: (params: { orderId: string }) => <OrderDetail orderId={params.orderId} /> },
];
