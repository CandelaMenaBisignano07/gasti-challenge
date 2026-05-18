import { Inject, Injectable } from '@nestjs/common';
import type { DateRange, Period } from '../domain/period';
import { addDays, calendarMonthRange, formatIso, startOfMonth } from '../domain/dates';
import { CLOCK, type Clock } from './clock';

@Injectable()
export class PeriodResolver {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  resolve(period: Period): DateRange {
    const now = this.clock.now();
    switch (period.kind) {
      case 'currentMonth':
        return { from: startOfMonth(now), to: formatIso(now) };
      case 'lastNDays':
        return { from: addDays(formatIso(now), -(period.n - 1)), to: formatIso(now) };
      case 'month':
        return calendarMonthRange(period.month);
      case 'customRange':
        return { from: period.from, to: period.to };
    }
  }
}
