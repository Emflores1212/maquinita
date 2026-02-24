export type { Database, Json } from './database';

import type { Database } from './database';

export type OperatorRow = Database['public']['Tables']['operators']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type MachineRow = Database['public']['Tables']['machines']['Row'];
export type ProductRow = Database['public']['Tables']['products']['Row'];
export type ProductCategoryRow = Database['public']['Tables']['product_categories']['Row'];
export type MachineProductPriceRow = Database['public']['Tables']['machine_product_prices']['Row'];
export type ParLevelRow = Database['public']['Tables']['par_levels']['Row'];
export type RFIDItemRow = Database['public']['Tables']['rfid_items']['Row'];
export type TagOrderRow = Database['public']['Tables']['tag_orders']['Row'];
export type TransactionRow = Database['public']['Tables']['transactions']['Row'];
export type AlertRow = Database['public']['Tables']['alerts']['Row'];
export type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];
