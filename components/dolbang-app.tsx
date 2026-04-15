"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatDistanceKm,
  formatGrowth,
  formatMaybeRatio,
  formatMaybeText,
  formatToEok,
  normalizeSearchText,
  sanitizePhoneNumberForTel,
} from "../lib/format";
import { haversineDistanceKm } from "../lib/haversine";
import type { CompanyRecord, CompanyWithDistance } from "../types/company";

const RADIUS_OPTIONS = [1, 3, 5] as const;

const parseDefaultCoordinate = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

type SortKey = "sales" | "profit" | "salesGrowth" | "profitGrowth";

const SORT_BUTTONS: Array<{ key: SortKey; label: string }> = [
  { key: "sales", label: "매출순" },
  { key: "profit", label: "영업이익순" },
  { key: "salesGrowth", label: "매출성장률순" },
  { key: "profitGrowth", label: "영업이익성장률순" },
];

const toValidNumber = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  return value;
};

const toGrowthMetric = (
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null => {
  const currentValue = toValidNumber(current);
  const previousValue = toValidNumber(previous);
  if (currentValue === null || previousValue === null || previousValue === 0) {
    return null;
  }
  return (currentValue - previousValue) / previousValue;
};

const compareNullableDesc = (a: number | null, b: number | null): number => {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return b - a;
};

const metricBySort = (company: CompanyWithDistance, sortKey: SortKey): number | null => {
  switch (sortKey) {
    case "sales":
      return toValidNumber(company.sales2025);
    case "profit":
      return toValidNumber(company.operatingProfit2025);
    case "salesGrowth":
      return toGrowthMetric(company.sales2025, company.sales2024);
    case "profitGrowth":
      return toGrowthMetric(company.operatingProfit2025, company.operatingProfit2024);
    default:
      return null;
  }
};

const DEFAULT_CENTER = {
  lat: parseDefaultCoordinate(process.env.NEXT_PUBLIC_DEFAULT_LAT, 37.5665),
  lng: parseDefaultCoordinate(process.env.NEXT_PUBLIC_DEFAULT_LNG, 126.978),
};

type MapStatus = "idle" | "loading" | "ready" | "no-key" | "error";
type DataStatus = "loading" | "ready" | "error";
type LocationStatus = "loading" | "ready" | "denied" | "unsupported" | "error";

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="grid grid-cols-[8rem_1fr] items-start gap-2 border-b border-slate-100 py-2 last:border-b-0">
    <dt className="whitespace-nowrap text-[13px] leading-5 tracking-[-0.01em] text-slate-500">
      {label}
    </dt>
    <dd className="min-w-0 text-sm font-medium leading-5 text-slate-800 break-words">
      {value}
    </dd>
  </div>
);

export default function DolbangApp() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const kakaoMapRef = useRef<KakaoMap | null>(null);
  const userMarkerRef = useRef<KakaoMarker | null>(null);
  const radiusCircleRef = useRef<KakaoCircle | null>(null);
  const companyMarkersRef = useRef<KakaoMarker[]>([]);

  const [mapStatus, setMapStatus] = useState<MapStatus>("idle");
  const [dataStatus, setDataStatus] = useState<DataStatus>("loading");
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("loading");
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  const [allCompanies, setAllCompanies] = useState<CompanyRecord[]>([]);
  const [userCenter, setUserCenter] = useState(DEFAULT_CENTER);
  const [searchText, setSearchText] = useState("");
  const [selectedRadiusKm, setSelectedRadiusKm] = useState<(typeof RADIUS_OPTIONS)[number]>(3);
  const [activeSort, setActiveSort] = useState<SortKey>("sales");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const kakaoMapKey = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;
    if (!kakaoMapKey) {
      setMapStatus("no-key");
      return;
    }

    const onKakaoLoaded = () => {
      if (!window.kakao?.maps) {
        setMapStatus("error");
        return;
      }
      window.kakao.maps.load(() => setMapStatus("ready"));
    };

    if (window.kakao?.maps) {
      setMapStatus("loading");
      onKakaoLoaded();
      return;
    }

    setMapStatus("loading");

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-kakao-maps-sdk="true"]',
    );
    if (existingScript) {
      existingScript.addEventListener("load", onKakaoLoaded);
      existingScript.addEventListener("error", () => setMapStatus("error"));
      return () => {
        existingScript.removeEventListener("load", onKakaoLoaded);
      };
    }

    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoMapKey}&autoload=false`;
    script.async = true;
    script.dataset.kakaoMapsSdk = "true";
    script.addEventListener("load", onKakaoLoaded);
    script.addEventListener("error", () => setMapStatus("error"));
    document.head.appendChild(script);

    return () => {
      script.removeEventListener("load", onKakaoLoaded);
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    const loadCompanies = async () => {
      try {
        setDataStatus("loading");
        const response = await fetch("/companies.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`companies.json load failed: ${response.status}`);
        }
        const payload = (await response.json()) as CompanyRecord[];
        if (!ignore) {
          setAllCompanies(Array.isArray(payload) ? payload : []);
          setDataStatus("ready");
        }
      } catch {
        if (!ignore) {
          setAllCompanies([]);
          setDataStatus("error");
        }
      }
    };

    void loadCompanies();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus("unsupported");
      setLocationMessage("브라우저가 위치 기능을 지원하지 않아 기본 지도로 표시합니다.");
      return;
    }

    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCenter({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationStatus("ready");
        setLocationMessage(null);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus("denied");
          setLocationMessage("위치 권한이 거부되어 기본 중심 좌표로 표시합니다.");
          return;
        }
        setLocationStatus("error");
        setLocationMessage("현재 위치를 가져오지 못해 기본 중심 좌표로 표시합니다.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }, []);

  const filteredByText = useMemo(() => {
    const keyword = normalizeSearchText(searchText);
    const candidates = allCompanies.filter(
      (company) => typeof company.lat === "number" && typeof company.lng === "number",
    );

    if (!keyword) {
      return candidates;
    }

    return candidates.filter((company) =>
      [company.corporationName, company.ceoName, company.industryName]
        .map((value) => normalizeSearchText(value ?? ""))
        .some((value) => value.includes(keyword)),
    );
  }, [allCompanies, searchText]);

  const nearbyCompanies = useMemo<CompanyWithDistance[]>(() => {
    return filteredByText
      .map((company) => ({
        ...company,
        distanceKm: haversineDistanceKm(
          userCenter.lat,
          userCenter.lng,
          company.lat as number,
          company.lng as number,
        ),
      }))
      .filter((company) => company.distanceKm <= selectedRadiusKm);
  }, [filteredByText, selectedRadiusKm, userCenter.lat, userCenter.lng]);

  const sortedNearbyCompanies = useMemo<CompanyWithDistance[]>(() => {
    return [...nearbyCompanies].sort((a, b) => {
      const metricCompare = compareNullableDesc(
        metricBySort(a, activeSort),
        metricBySort(b, activeSort),
      );
      if (metricCompare !== 0) {
        return metricCompare;
      }
      return a.distanceKm - b.distanceKm;
    });
  }, [nearbyCompanies, activeSort]);

  const selectedCompany = useMemo<CompanyWithDistance | null>(() => {
    if (!selectedCompanyId) {
      return null;
    }
    return nearbyCompanies.find((company) => company.id === selectedCompanyId) ?? null;
  }, [nearbyCompanies, selectedCompanyId]);

  useEffect(() => {
    if (!selectedCompanyId) {
      return;
    }
    const stillVisible = nearbyCompanies.some((company) => company.id === selectedCompanyId);
    if (!stillVisible) {
      setSelectedCompanyId(null);
    }
  }, [nearbyCompanies, selectedCompanyId]);

  useEffect(() => {
    if (mapStatus !== "ready" || !mapContainerRef.current || !window.kakao?.maps) {
      return;
    }

    const kakaoMaps = window.kakao.maps;
    const center = new kakaoMaps.LatLng(userCenter.lat, userCenter.lng);

    if (!kakaoMapRef.current) {
      kakaoMapRef.current = new kakaoMaps.Map(mapContainerRef.current, {
        center,
        level: 6,
      });
    } else {
      kakaoMapRef.current.setCenter(center);
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setMap(null);
    }
    userMarkerRef.current = new kakaoMaps.Marker({
      map: kakaoMapRef.current,
      position: center,
      title: "현재 위치",
    });

    if (radiusCircleRef.current) {
      radiusCircleRef.current.setMap(null);
    }
    radiusCircleRef.current = new kakaoMaps.Circle({
      center,
      radius: selectedRadiusKm * 1000,
      strokeWeight: 2,
      strokeColor: "#3f74f5",
      strokeOpacity: 0.8,
      fillColor: "#7aa8ff",
      fillOpacity: 0.18,
    });
    radiusCircleRef.current.setMap(kakaoMapRef.current);

    companyMarkersRef.current.forEach((marker) => marker.setMap(null));
    companyMarkersRef.current = nearbyCompanies.map((company) => {
      const marker = new kakaoMaps.Marker({
        map: kakaoMapRef.current,
        position: new kakaoMaps.LatLng(company.lat as number, company.lng as number),
        title: company.corporationName,
      });
      kakaoMaps.event.addListener(marker, "click", () => {
        setSelectedCompanyId(company.id);
      });
      return marker;
    });
  }, [mapStatus, nearbyCompanies, selectedRadiusKm, userCenter.lat, userCenter.lng]);

  useEffect(() => {
    if (!selectedCompany || !kakaoMapRef.current || !window.kakao?.maps) {
      return;
    }
    const target = new window.kakao.maps.LatLng(
      selectedCompany.lat as number,
      selectedCompany.lng as number,
    );
    kakaoMapRef.current.panTo(target);
  }, [selectedCompany]);

  const navigationLink =
    selectedCompany && selectedCompany.lat !== null && selectedCompany.lng !== null
      ? `https://map.kakao.com/link/to/${encodeURIComponent(
          selectedCompany.corporationName,
        )},${selectedCompany.lat},${selectedCompany.lng}`
      : null;

  const selectedTel = sanitizePhoneNumberForTel(selectedCompany?.phoneNumber);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col bg-transparent pb-36">
      <header className="sticky top-0 z-20 border-b border-brand-100 bg-white/95 px-4 py-4 backdrop-blur">
        <h1 className="text-xl font-bold text-brand-700">돌방 Helper</h1>
        <p className="mt-1 text-xs text-slate-600">현장 방문용 근거리 기업 탐색</p>
      </header>

      <section className="space-y-3 px-4 pt-4">
        <input
          type="text"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="기업명, 대표자명, 업종으로 검색"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />

        <div className="flex items-center gap-2">
          {RADIUS_OPTIONS.map((radius) => (
            <button
              key={radius}
              type="button"
              onClick={() => setSelectedRadiusKm(radius)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                selectedRadiusKm === radius
                  ? "bg-brand-600 text-white shadow"
                  : "bg-white text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              {radius}km
            </button>
          ))}
        </div>
      </section>

      <section className="relative px-4 pt-3">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
          <div ref={mapContainerRef} className="h-[42vh] w-full min-h-[320px]" />
        </div>

        {(mapStatus === "no-key" || mapStatus === "error") && (
          <div className="absolute inset-x-6 top-8 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            Kakao 지도 키를 확인해주세요. `.env.local`의 `NEXT_PUBLIC_KAKAO_MAP_JS_KEY`가 필요합니다.
          </div>
        )}

        {locationStatus === "loading" && (
          <div className="absolute left-6 top-8 rounded-lg bg-slate-900/80 px-3 py-2 text-xs text-white">
            현재 위치를 확인 중입니다...
          </div>
        )}

        {locationMessage && (
          <div className="absolute bottom-4 left-6 right-6 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {locationMessage}
          </div>
        )}
      </section>

      <section className="mt-4 px-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">반경 내 기업</h2>
          <span className="text-xs text-slate-500">
            {selectedRadiusKm}km · {sortedNearbyCompanies.length}개
          </span>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {SORT_BUTTONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setActiveSort(option.key)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                activeSort === option.key
                  ? "bg-brand-600 text-white shadow"
                  : "bg-white text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {dataStatus === "error" && (
          <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            `public/companies.json`을 읽지 못했습니다. 먼저 `npm run prepare:data`를 실행해주세요.
          </p>
        )}

        {dataStatus === "ready" && sortedNearbyCompanies.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-600">
            현재 조건에 맞는 기업이 없습니다. 검색어 또는 반경을 조정해보세요.
          </p>
        )}

        <div className="space-y-2 pb-6">
          {sortedNearbyCompanies.map((company) => {
            const tel = sanitizePhoneNumberForTel(company.phoneNumber);
            const isSelected = selectedCompanyId === company.id;
            const salesGrowth = formatGrowth(company.sales2025, company.sales2024);
            const profitGrowth = formatGrowth(
              company.operatingProfit2025,
              company.operatingProfit2024,
            );

            return (
              <article
                key={company.id}
                onClick={() => setSelectedCompanyId(company.id)}
                className={`cursor-pointer rounded-2xl border bg-white px-3 py-3 shadow-sm transition ${
                  isSelected ? "border-brand-400 ring-2 ring-brand-100" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{company.corporationName}</h3>
                    <p className="mt-1 text-xs text-slate-600">{formatMaybeText(company.industryName)}</p>
                  </div>
                  <span className="rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700">
                    {formatDistanceKm(company.distanceKm)}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 text-xs">
                  <div>
                    <p className="text-slate-500">2025 매출</p>
                    <p className="font-semibold text-slate-800">{formatToEok(company.sales2025)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">2025 영업이익</p>
                    <p className="font-semibold text-slate-800">
                      {formatToEok(company.operatingProfit2025)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">매출 성장률</p>
                    <p className="font-semibold text-slate-800">{salesGrowth}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">영업이익 성장률</p>
                    <p className="font-semibold text-slate-800">{profitGrowth}</p>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                  <span>대표 {formatMaybeText(company.ceoName)}</span>
                  {tel ? (
                    <a
                      href={`tel:${tel}`}
                      onClick={(event) => event.stopPropagation()}
                      className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700"
                    >
                      전화걸기
                    </a>
                  ) : (
                    <span className="text-slate-400">전화번호 없음</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selectedCompany && (
        <aside className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-3xl rounded-t-3xl border border-slate-200 bg-white p-4 shadow-[0_-12px_30px_rgba(15,23,42,0.14)]">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-brand-600">상세 정보</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">{selectedCompany.corporationName}</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCompanyId(null)}
              className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
            >
              닫기
            </button>
          </div>

          <dl>
            <DetailRow label="거리" value={formatDistanceKm(selectedCompany.distanceKm)} />
            <DetailRow label="대표자" value={formatMaybeText(selectedCompany.ceoName)} />
            <DetailRow label="전화번호" value={formatMaybeText(selectedCompany.phoneNumber)} />
            <DetailRow label="업종" value={formatMaybeText(selectedCompany.industryName)} />
            <DetailRow label="사업영역" value={formatMaybeText(selectedCompany.businessArea)} />
            <DetailRow label="도로명주소" value={formatMaybeText(selectedCompany.roadAddress)} />
            <DetailRow label="지번주소" value={formatMaybeText(selectedCompany.jibunAddress)} />
            <DetailRow label="2024 매출" value={formatToEok(selectedCompany.sales2024)} />
            <DetailRow label="2024 영업이익" value={formatToEok(selectedCompany.operatingProfit2024)} />
            <DetailRow label="2025 매출" value={formatToEok(selectedCompany.sales2025)} />
            <DetailRow label="2025 영업이익" value={formatToEok(selectedCompany.operatingProfit2025)} />
            <DetailRow
              label="매출 성장률"
              value={formatGrowth(selectedCompany.sales2025, selectedCompany.sales2024)}
            />
            <DetailRow
              label="영업이익 성장률"
              value={formatGrowth(
                selectedCompany.operatingProfit2025,
                selectedCompany.operatingProfit2024,
              )}
            />
            <DetailRow label="유동비율" value={formatMaybeRatio(selectedCompany.currentRatio)} />
            <DetailRow label="부채비율" value={formatMaybeRatio(selectedCompany.debtRatio)} />
          </dl>

          <div className="mt-4 flex gap-2">
            {selectedTel ? (
              <a
                href={`tel:${selectedTel}`}
                className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white"
              >
                전화걸기
              </a>
            ) : (
              <span className="flex-1 rounded-xl bg-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-500">
                전화번호 없음
              </span>
            )}

            {navigationLink ? (
              <a
                href={navigationLink}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-xl bg-brand-600 px-3 py-2 text-center text-sm font-semibold text-white"
              >
                길찾기
              </a>
            ) : (
              <span className="flex-1 rounded-xl bg-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-500">
                길찾기 불가
              </span>
            )}
          </div>
        </aside>
      )}
    </main>
  );
}
