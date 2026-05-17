export const INCOME_REPOSITORY = 'INCOME_REPOSITORY';

export interface OneOffIncome {
  amount: number;
  date: string;
  description: string;
}

export interface IncomeStatement {
  recurringMonthly: number | null;
  oneOffs: OneOffIncome[];
}

export interface IncomeRepository {
  get(): Promise<IncomeStatement>;
  setRecurring(amount: number): Promise<void>;
  addOneOff(entry: OneOffIncome): Promise<void>;
}
