export type InventoryProduct = {
  id: string;
  name: string;
  photo_url: string | null;
};

export type InventoryMachine = {
  id: string;
  name: string;
  status?: string | null;
};

export type InventoryItemInMachine = {
  epc: string;
  machine_id: string | null;
  product_id: string | null;
  expiration_date: string | null;
  status: string | null;
};

export type ParLevel = {
  machine_id: string;
  product_id: string;
  quantity: number;
};

export type TagOrder = {
  id: string;
  tag_type: string | null;
  quantity: number | null;
  status: string | null;
  created_at: string | null;
};

export type ShippingAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  contactName: string;
  phone: string;
};

export type ExpirationItem = {
  epc: string;
  product_id: string | null;
  machine_id: string | null;
  expiration_date: string | null;
  product_name: string | null;
  product_photo_url: string | null;
  machine_name: string | null;
};
