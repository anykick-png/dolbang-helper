import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import XLSX from "xlsx";

dotenv.config({ path: ".env.local" });
dotenv.config();

const FIELD_CONFIG = {
  corporationName: {
    keywords: ["entity_name", "name", "법인명", "기업명", "회사명", "상호"],
    weight: 7,
  },
  ceoName: {
    keywords: ["ceo", "대표", "대표자", "대표이사"],
    weight: 4,
  },
  phoneNumber: {
    keywords: ["tel", "phone", "전화", "연락처", "전화번호"],
    weight: 4,
  },
  industryName: {
    keywords: ["업종명", "industry_name", "industry"],
    weight: 5,
  },
  businessArea: {
    keywords: ["사업영역", "business_area", "사업분야", "주요사업"],
    weight: 5,
  },
  roadAddress: {
    keywords: ["도로명주소", "address_road_name", "road_address"],
    weight: 6,
  },
  jibunAddress: {
    keywords: ["지번주소", "address_land_lot", "land_lot_address"],
    weight: 5,
  },
  sales2024: {
    keywords: ["매출 2024", "2024 매출", "sales 2024", "sales2024"],
    weight: 5,
  },
  operatingProfit2024: {
    keywords: ["영업이익 2024", "2024 영업이익", "operating profit 2024", "op2024"],
    weight: 5,
  },
  sales2025: {
    keywords: ["매출 2025", "2025 매출", "sales 2025", "sales2025"],
    weight: 5,
  },
  operatingProfit2025: {
    keywords: ["영업이익 2025", "2025 영업이익", "operating profit 2025", "op2025"],
    weight: 5,
  },
  currentRatio: {
    keywords: ["유동비율", "current ratio", "current_ratio"],
    weight: 4,
  },
  debtRatio: {
    keywords: ["부채비율", "debt ratio", "debt_ratio"],
    weight: 4,
  },
};

const REQUIRED_DIRECTORIES = ["public", "data"];

const EXCEL_PATH = path.resolve(process.cwd(), "realdolbang_fixed.xlsx");
const OUTPUT_COMPANIES_PATH = path.resolve(process.cwd(), "public", "companies.json");
const OUTPUT_CLEANED_PATH = path.resolve(process.cwd(), "data", "cleaned_companies.json");
const OUTPUT_FAILED_PATH = path.resolve(process.cwd(), "data", "failed_addresses.json");
const OUTPUT_SUMMARY_PATH = path.resolve(process.cwd(), "data", "preparation_summary.json");
const GEO_CACHE_PATH = path.resolve(process.cwd(), "data", "geocode_cache.json");

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY?.trim() ?? "";
const GEOCODE_TIMEOUT_MS = 8000;
const GEOCODE_CONCURRENCY = 8;

const normalize = (input) =>
  String(input ?? "")
    .toLowerCase()
    .replace(/[\s\-_./()[\]]/g, "")
    .trim();

const normalizeTextValue = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const toNumberOrNull = (value) => {
  const text = normalizeTextValue(value);
  if (!text) {
    return null;
  }
  const numeric = Number(text.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const hasValue = (value) => Boolean(normalizeTextValue(value));

const scoreColumn = (columnName, keywords) => {
  const column = normalize(columnName);
  if (!column) {
    return 0;
  }

  let best = 0;
  for (const keyword of keywords) {
    const key = normalize(keyword);
    if (!key) {
      continue;
    }
    if (column === key) {
      best = Math.max(best, 100);
      continue;
    }
    if (column.includes(key) || key.includes(column)) {
      best = Math.max(best, 70);
      continue;
    }

    const tokens = key.split(/(?=[A-Z])|[0-9]/).filter(Boolean);
    const tokenHits = tokens.filter((token) => token.length >= 2 && column.includes(token)).length;
    best = Math.max(best, tokenHits * 20);
  }

  return best;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const inspectSheet = (sheetName, rows, headers) => {
  const mapping = {};

  for (const field of Object.keys(FIELD_CONFIG)) {
    const fieldConfig = FIELD_CONFIG[field];
    let bestCandidate = null;

    for (const header of headers) {
      const semanticScore = scoreColumn(header, fieldConfig.keywords);
      if (semanticScore <= 0) {
        continue;
      }

      const nonEmptyCount = rows.filter((row) => hasValue(row[header])).length;
      const coverage = rows.length > 0 ? nonEmptyCount / rows.length : 0;
      const totalScore = semanticScore + coverage * 15;

      if (!bestCandidate || totalScore > bestCandidate.score) {
        bestCandidate = {
          column: header,
          score: Number(totalScore.toFixed(2)),
          coverage: Number(coverage.toFixed(3)),
        };
      }
    }

    if (bestCandidate) {
      mapping[field] = bestCandidate;
    }
  }

  let totalScore = 0;
  for (const field of Object.keys(FIELD_CONFIG)) {
    const candidate = mapping[field];
    if (!candidate) {
      continue;
    }
    totalScore += candidate.score * FIELD_CONFIG[field].weight;
  }

  if (!mapping.corporationName) {
    totalScore -= 300;
  }
  if (!mapping.roadAddress && !mapping.jibunAddress) {
    totalScore -= 250;
  }

  return {
    sheetName,
    rowCount: rows.length,
    mapping,
    totalScore: Number(totalScore.toFixed(2)),
  };
};

const geocodeAddress = async (address) => {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(
    address,
  )}`;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `KakaoAK ${KAKAO_REST_API_KEY}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) {
          await sleep(attempt * 300);
          continue;
        }
        return null;
      }

      const data = await response.json();
      const doc = data.documents?.[0];
      if (!doc || !doc.x || !doc.y) {
        return null;
      }

      const lng = Number(doc.x);
      const lat = Number(doc.y);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }

      return { lat, lng };
    } catch {
      clearTimeout(timeout);
      await sleep(attempt * 300);
    }
  }

  return null;
};

const loadGeocodeCache = async () => {
  if (!existsSync(GEO_CACHE_PATH)) {
    return {};
  }

  try {
    const raw = await readFile(GEO_CACHE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed ?? {};
  } catch {
    return {};
  }
};

const main = async () => {
  if (!existsSync(EXCEL_PATH)) {
    throw new Error("realdolbang_fixed.xlsx 파일을 찾을 수 없습니다.");
  }

  await Promise.all(
    REQUIRED_DIRECTORIES.map((directory) =>
      mkdir(path.resolve(process.cwd(), directory), { recursive: true }),
    ),
  );

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetInspections = [];
  const sheetRowsByName = new Map();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw: false,
    });
    sheetRowsByName.set(sheetName, rows);

    const headerRow = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    })[0];

    const headers = (headerRow ?? [])
      .map((column) => String(column ?? "").trim())
      .filter((column) => column.length > 0);

    sheetInspections.push(inspectSheet(sheetName, rows, headers));
  }

  sheetInspections.sort((a, b) => b.totalScore - a.totalScore);
  const bestSheet = sheetInspections[0];
  if (!bestSheet) {
    throw new Error("엑셀 시트를 읽지 못했습니다.");
  }

  const selectedRows = sheetRowsByName.get(bestSheet.sheetName) ?? [];
  const picked = (row, field) => {
    const column = bestSheet.mapping[field]?.column;
    return column ? row[column] : null;
  };

  const companies = [];
  for (let index = 0; index < selectedRows.length; index += 1) {
    const row = selectedRows[index];
    const corporationName = normalizeTextValue(picked(row, "corporationName"));
    if (!corporationName) {
      continue;
    }

    const symbol = normalizeTextValue(row.symbol);
    const id = symbol ?? `row-${index + 1}`;

    companies.push({
      id,
      symbol,
      corporationName,
      ceoName: normalizeTextValue(picked(row, "ceoName")),
      phoneNumber: normalizeTextValue(picked(row, "phoneNumber")),
      industryName: normalizeTextValue(picked(row, "industryName")),
      businessArea: normalizeTextValue(picked(row, "businessArea")),
      roadAddress: normalizeTextValue(picked(row, "roadAddress")),
      jibunAddress: normalizeTextValue(picked(row, "jibunAddress")),
      sales2024: toNumberOrNull(picked(row, "sales2024")),
      operatingProfit2024: toNumberOrNull(picked(row, "operatingProfit2024")),
      sales2025: toNumberOrNull(picked(row, "sales2025")),
      operatingProfit2025: toNumberOrNull(picked(row, "operatingProfit2025")),
      currentRatio: toNumberOrNull(picked(row, "currentRatio")),
      debtRatio: toNumberOrNull(picked(row, "debtRatio")),
      lat: null,
      lng: null,
    });
  }

  const geocodeCache = await loadGeocodeCache();
  const uniqueAddresses = Array.from(
    new Set(companies.map((company) => company.roadAddress ?? company.jibunAddress).filter(Boolean)),
  );

  if (KAKAO_REST_API_KEY) {
    const pendingAddresses = uniqueAddresses.filter((address) => !geocodeCache[address]);
    for (let index = 0; index < pendingAddresses.length; index += GEOCODE_CONCURRENCY) {
      const chunk = pendingAddresses.slice(index, index + GEOCODE_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (address) => ({
          address,
          point: await geocodeAddress(address),
        })),
      );

      for (const result of chunkResults) {
        if (result.point) {
          geocodeCache[result.address] = result.point;
        }
      }

      if ((index / GEOCODE_CONCURRENCY) % 5 === 0) {
        await writeFile(GEO_CACHE_PATH, JSON.stringify(geocodeCache, null, 2), "utf-8");
        console.log(
          `[geocode] ${Math.min(index + GEOCODE_CONCURRENCY, pendingAddresses.length)}/${
            pendingAddresses.length
          }`,
        );
      }
    }
  }

  const failedRows = [];
  const mergedCompanies = companies.map((company) => {
    const address = company.roadAddress ?? company.jibunAddress;
    if (!address) {
      failedRows.push({
        id: company.id,
        corporationName: company.corporationName,
        address: null,
        reason: "MISSING_ADDRESS",
      });
      return company;
    }

    const point = geocodeCache[address];
    if (!point) {
      failedRows.push({
        id: company.id,
        corporationName: company.corporationName,
        address,
        reason: KAKAO_REST_API_KEY ? "GEOCODE_NOT_FOUND" : "MISSING_KAKAO_REST_API_KEY",
      });
      return company;
    }

    return {
      ...company,
      lat: point.lat,
      lng: point.lng,
    };
  });

  const geocodedCompanies = mergedCompanies.filter(
    (company) => Number.isFinite(company.lat) && Number.isFinite(company.lng),
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    excelPath: EXCEL_PATH,
    selectedSheet: bestSheet.sheetName,
    selectedSheetRows: bestSheet.rowCount,
    sheetInspections,
    totalCompanies: mergedCompanies.length,
    geocodedCompanies: geocodedCompanies.length,
    failedAddresses: failedRows.length,
    hasKakaoRestApiKey: Boolean(KAKAO_REST_API_KEY),
  };

  await Promise.all([
    writeFile(OUTPUT_CLEANED_PATH, JSON.stringify(mergedCompanies, null, 2), "utf-8"),
    writeFile(OUTPUT_COMPANIES_PATH, JSON.stringify(geocodedCompanies, null, 2), "utf-8"),
    writeFile(OUTPUT_FAILED_PATH, JSON.stringify(failedRows, null, 2), "utf-8"),
    writeFile(OUTPUT_SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf-8"),
    writeFile(GEO_CACHE_PATH, JSON.stringify(geocodeCache, null, 2), "utf-8"),
  ]);

  console.log("=== 돌방도우미 데이터 전처리 완료 ===");
  console.log(`선택 시트: ${bestSheet.sheetName}`);
  console.log(`전체 기업 수: ${mergedCompanies.length}`);
  console.log(`지오코딩 성공: ${geocodedCompanies.length}`);
  console.log(`실패 주소 수: ${failedRows.length}`);
  console.log(`출력 파일: ${OUTPUT_COMPANIES_PATH}`);
};

main().catch((error) => {
  console.error("[prepare:data] 실패:", error);
  process.exitCode = 1;
});
