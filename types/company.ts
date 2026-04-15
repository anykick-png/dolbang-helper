export interface CompanyRecord {
  id: string;
  symbol: string | null;
  corporationName: string;
  ceoName: string | null;
  phoneNumber: string | null;
  industryName: string | null;
  businessArea: string | null;
  roadAddress: string | null;
  jibunAddress: string | null;
  sales2024: number | null;
  operatingProfit2024: number | null;
  sales2025: number | null;
  operatingProfit2025: number | null;
  currentRatio: number | null;
  debtRatio: number | null;
  lat: number | null;
  lng: number | null;
}

export interface CompanyWithDistance extends CompanyRecord {
  distanceKm: number;
}

