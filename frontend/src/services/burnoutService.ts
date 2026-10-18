import { burnoutDemoData } from '../data/burnoutDemoData';
import type { BurnoutPageData } from '../data/burnoutDemoData';

export type { BurnoutPageData, BurnoutTrendPoint } from '../data/burnoutDemoData';

/** Stable page-facing contract for loading burnout insights. */
export interface BurnoutDataService {
  getDashboardData(): Promise<BurnoutPageData>;
}

/** Local mock implementation; intentionally makes no network or backend request. */
const mockBurnoutService: BurnoutDataService = {
  async getDashboardData() {
    return burnoutDemoData;
  },
};

/** Replace this implementation with the existing backend integration when requested. */
export const burnoutService: BurnoutDataService = mockBurnoutService;
