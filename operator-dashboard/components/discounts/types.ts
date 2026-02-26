import type { DiscountRow, ExpirationRuleRow } from '@/lib/types';

export type DiscountListItem = DiscountRow;
export type ExpirationRuleListItem = ExpirationRuleRow;

export type DiscountTargetOption = {
  id: string;
  name: string;
};

export type DiscountPerformanceTxRow = {
  id: string;
  discountId: string;
  machineId: string | null;
  machineName: string;
  amount: number;
  discountAmount: number;
  status: string;
  createdAt: string;
};
