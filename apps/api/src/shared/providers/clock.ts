export interface Clock {
  now(): Date;
}

export const CLOCK = 'CLOCK';

export const systemClock: Clock = {
  now: () => new Date(),
};
