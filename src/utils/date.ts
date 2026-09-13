export const formatDate = (date: Date): string => {
  return date.toISOString();
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const addHours = (date: Date, hours: number): Date => {
  const result = new Date(date);
  result.setTime(result.getTime() + hours * 60 * 60 * 1000);
  return result;
};

export const isExpired = (date: Date): boolean => {
  return date.getTime() < Date.now();
};