export const formatMaybeText = (value: string | null | undefined): string => {
  const text = value?.trim();
  return text && text.length > 0 ? text : "-";
};

export const formatMaybeCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${Math.round(value).toLocaleString("ko-KR")}\uC6D0`;
};

export const formatMaybeRatio = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  if (Math.abs(value) <= 5) {
    return `${(value * 100).toFixed(1)}%`;
  }

  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
};

export const formatDistanceKm = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  if (value < 1) {
    return `${Math.round(value * 1000)}m`;
  }
  return `${value.toFixed(2)}km`;
};

export const normalizeSearchText = (value: string): string =>
  value.trim().toLowerCase();

export const sanitizePhoneNumberForTel = (
  value: string | null | undefined,
): string | null => {
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/[^\d+]/g, "");
  return cleaned.length > 0 ? cleaned : null;
};

export const formatToEok = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  const eok = value / 100_000_000;
  const absEok = Math.abs(eok);

  if (absEok < 10) {
    const rounded = Math.round(eok * 10) / 10;
    const hasDecimal = Math.abs(rounded % 1) > 0;
    const formatted = rounded.toLocaleString("ko-KR", {
      minimumFractionDigits: hasDecimal ? 1 : 0,
      maximumFractionDigits: 1,
    });
    return `${formatted}\uC5B5\uC6D0`;
  }

  return `${Math.round(eok).toLocaleString("ko-KR")}\uC5B5\uC6D0`;
};

export const formatGrowth = (
  current: number | null | undefined,
  prev: number | null | undefined,
): string => {
  if (
    current === null ||
    current === undefined ||
    prev === null ||
    prev === undefined ||
    Number.isNaN(current) ||
    Number.isNaN(prev) ||
    prev === 0
  ) {
    return "-";
  }

  const ratio = (current - prev) / prev;
  const signed = ratio >= 0 ? "+" : "";
  return `${signed}${(ratio * 100).toFixed(1)}%`;
};

