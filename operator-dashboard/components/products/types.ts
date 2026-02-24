export type ProductCategory = {
  id: string;
  name: string;
  color: string | null;
  sort_order: number | null;
};

export type ProductListItem = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  base_price: number;
  status: string | null;
  photo_url: string | null;
  description: string | null;
  category_name: string | null;
  category_color: string | null;
};

export type MachineOption = {
  id: string;
  name: string;
};

export type MachinePrice = {
  machine_id: string;
  product_id: string;
  price: number;
};

export type ProductDetailData = {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  description: string | null;
  base_price: number;
  photo_url: string | null;
  nutritional: Record<string, unknown> | null;
  allergens: string[] | null;
  status: string | null;
};

export type CsvPreviewRow = {
  rowIndex: number;
  row: {
    name: string;
    sku: string | null;
    category: string | null;
    price: string;
    description: string | null;
    calories: string | null;
    protein: string | null;
    fat: string | null;
    carbs: string | null;
    allergens: string | null;
  };
  error: string | null;
};
