export type ConsumerOperatorSummary = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
};

export type ConsumerMachineRow = {
  id: string;
  name: string;
  status: string | null;
  locationName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

export type ConsumerProductInventoryRow = {
  id: string;
  name: string;
  photoUrl: string | null;
  basePrice: number;
  categoryId: string | null;
  categoryName: string;
  nutritional: Record<string, unknown>;
  allergens: string[];
  count: number;
  discountPct: number;
  finalPrice: number;
  onSale: boolean;
};

export type ConsumerPurchaseRow = {
  id: string;
  createdAt: string;
  amount: number;
  machineName: string;
  itemsSummary: string;
};

export type ConsumerFeedbackTarget = {
  transactionId: string;
  machineId: string | null;
  machineName: string;
  productId: string | null;
  productName: string;
};
